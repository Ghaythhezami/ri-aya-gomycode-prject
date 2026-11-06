import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ClinicSettingsDto,
  DayMetrics,
  GridBlock,
  MoveValidation,
  OptimizationObjective,
  OptimizationProposal,
  ProposalMove,
  SchedulingDay,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import {
  availableIntervals,
  dayRuleIntervals,
  isWithinAvailability,
  subtractIntervals,
  toInterval,
  type Interval,
} from '../core/availability';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { localDayBounds, localMinuteOfDay, toLocalDate } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { doctorName, initials } from '../common/mappers';
import { NotificationsService } from '../notifications/notifications.service';
import { computeDayMetrics } from './metrics';
import {
  insideAvailability,
  isMovable,
  optimize,
  type OptAppointment,
  type OptimizerInput,
  type OptimizerResult,
} from './optimizer';
import { scheduleVersion } from './version';
import { ServiceClient } from '../services/service-client';
import { SCHEDULER_CLIENT } from '../services/service-tokens';

export const UNDO_WINDOW_MS = 15 * 60_000;
const INACTIVE = ['CANCELLED', 'NO_SHOW'];

type Db = { doctor: PrismaService['doctor']; appointment: PrismaService['appointment'] };
type Tx = Prisma.TransactionClient;

interface DoctorCtx {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  roomId: string | null;
  userId: string | null;
  available: Interval[];
  work: Interval[];
  breaks: Interval[];
}

interface AppointmentCtx {
  id: string;
  code: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  type: string;
  locked: boolean;
  patientName: string;
}

export interface DayContext {
  clinicId: string;
  date: string;
  settings: ClinicSettingsDto;
  timeZone: string;
  start: Date;
  end: Date;
  doctors: DoctorCtx[];
  appointments: AppointmentCtx[];
}

interface StoredProposal {
  moves: ProposalMove[];
  before: OptimizationProposal['before'];
  after: OptimizationProposal['after'];
  unresolved: OptimizationProposal['unresolved'];
  idleDoctors: OptimizationProposal['idleDoctors'];
  status: OptimizationProposal['status'];
  engine?: OptimizationProposal['engine'];
}

export type OptimizerEngine = NonNullable<OptimizationProposal['engine']>;

const iso = (i: Interval) => ({
  startsAt: new Date(i.start).toISOString(),
  endsAt: new Date(i.end).toISOString(),
});

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
    private readonly cache: RedisCacheService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(SCHEDULER_CLIENT) private readonly scheduler?: ServiceClient,
  ) {}

  static metricsKey(clinicId: string, date: string): string {
    return `metrics:${clinicId}:${date}`;
  }

  // ------------------------------------------------------------- loading

  async loadContext(clinicId: string, date: string, db: Db = this.prisma): Promise<DayContext> {
    const settings = await this.settings.get(clinicId);
    const timeZone = settings.clinic.timezone;
    const { start, end } = localDayBounds(date, timeZone);
    const doctors = await db.doctor.findMany({
      where: { clinicId, isActive: true },
      include: {
        workingHours: true,
        leaves: { where: { startsAt: { lt: end }, endsAt: { gt: start } } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    const rows = await db.appointment.findMany({
      where: { clinicId, startsAt: { gte: start, lt: end } },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: [{ startsAt: 'asc' }, { code: 'asc' }],
    });
    return {
      clinicId,
      date,
      settings,
      timeZone,
      start,
      end,
      doctors: doctors.map((d) => {
        const rules = d.workingHours;
        const leaves = d.leaves.map((l) => ({ startsAt: l.startsAt, endsAt: l.endsAt }));
        const ruled = dayRuleIntervals(date, timeZone, rules);
        return {
          id: d.id,
          name: doctorName(d),
          initials: initials(d.firstName, d.lastName),
          specialty: d.specialty,
          roomId: d.roomId,
          userId: d.userId,
          available: availableIntervals(date, timeZone, rules, leaves),
          work: subtractIntervals(ruled.work, leaves.map(toInterval)),
          breaks: ruled.breaks,
        };
      }),
      appointments: rows.map((a) => ({
        id: a.id,
        code: a.code,
        doctorId: a.doctorId,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        type: a.type,
        locked: a.locked,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
      })),
    };
  }

  private active(ctx: DayContext): AppointmentCtx[] {
    return ctx.appointments.filter((a) => !INACTIVE.includes(a.status));
  }

  version(ctx: DayContext): string {
    return scheduleVersion(ctx.appointments);
  }

  private metricsOf(ctx: DayContext): DayMetrics {
    return computeDayMetrics(
      ctx.date,
      ctx.doctors.map((d) => ({ id: d.id, available: d.available })),
      this.active(ctx).map((a) => ({
        doctorId: a.doctorId,
        start: a.startsAt.getTime(),
        end: a.endsAt.getTime(),
      })),
    );
  }

  async metrics(clinicId: string, date: string): Promise<DayMetrics> {
    const key = SchedulingService.metricsKey(clinicId, date);
    const cached = await this.cache.get<DayMetrics>(key);
    if (cached) return cached;
    const metrics = this.metricsOf(await this.loadContext(clinicId, date));
    await this.cache.set(key, metrics, 60);
    return metrics;
  }

  // ------------------------------------------------------------- day grid

  async day(clinicId: string, date: string, now = new Date()): Promise<SchedulingDay> {
    const ctx = await this.loadContext(clinicId, date);
    const works = ctx.doctors.flatMap((d) => d.work);
    const toMinute = (ms: number, edge: 'start' | 'end') => {
      const instant = new Date(ms);
      if (edge === 'end' && toLocalDate(instant, ctx.timeZone) !== date) return 24 * 60;
      return localMinuteOfDay(instant, ctx.timeZone);
    };
    const dayStartMinute = works.length
      ? Math.min(...works.map((w) => toMinute(w.start, 'start')))
      : 8 * 60;
    const dayEndMinute = works.length
      ? Math.max(...works.map((w) => toMinute(w.end, 'end')))
      : 18 * 60;
    const active = this.active(ctx);
    return {
      date,
      timezone: ctx.timeZone,
      dayStartMinute,
      dayEndMinute,
      doctors: ctx.doctors.map((d) => ({
        id: d.id,
        name: d.name,
        initials: d.initials,
        specialty: d.specialty,
        work: d.work.map(iso),
        breaks: d.breaks.map(iso),
        blocks: active
          .filter((a) => a.doctorId === d.id)
          .map<GridBlock>((a) => ({
            appointmentId: a.id,
            code: a.code,
            patientName: a.patientName,
            type: a.type as GridBlock['type'],
            status: a.status as GridBlock['status'],
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt.toISOString(),
            movable: isMovable(this.toOpt(a), now.getTime()),
            conflict:
              !isWithinAvailability(a, d.available) ||
              active.some(
                (o) =>
                  o.id !== a.id &&
                  o.doctorId === a.doctorId &&
                  o.startsAt < a.endsAt &&
                  a.startsAt < o.endsAt,
              ),
          })),
      })),
      metrics: this.metricsOf(ctx),
      version: this.version(ctx),
    };
  }

  // ------------------------------------------------------------- optimiser

  private toOpt(a: AppointmentCtx): OptAppointment {
    return {
      id: a.id,
      code: a.code,
      doctorId: a.doctorId,
      start: a.startsAt.getTime(),
      end: a.endsAt.getTime(),
      status: a.status,
      type: a.type,
      locked: a.locked,
    };
  }

  private optimizerInput(
    ctx: DayContext,
    objective: OptimizationObjective,
    now: Date,
  ): OptimizerInput {
    return {
      doctors: ctx.doctors.map((d) => ({
        id: d.id,
        specialty: d.specialty,
        available: d.available,
      })),
      appointments: this.active(ctx).map((a) => this.toOpt(a)),
      objective,
      now: now.getTime(),
      slotMinutes: ctx.settings.slotMinutes,
      dayStart: ctx.start.getTime(),
      dayEnd: ctx.end.getTime(),
    };
  }

  runOptimizer(ctx: DayContext, objective: OptimizationObjective, now: Date): OptimizerResult {
    return optimize(this.optimizerInput(ctx, objective, now));
  }

  /**
   * Optimiser behind "Optimize": the Python service when `SCHEDULER_URL` is set (ADR 0003),
   * the in-process TypeScript optimiser otherwise or when the service fails. Both implement the
   * same algorithm and are kept identical by the shared parity fixtures.
   */
  async runOptimizerPreferred(
    clinicId: string,
    ctx: DayContext,
    objective: OptimizationObjective,
    now: Date,
  ): Promise<{ result: OptimizerResult; engine: OptimizerEngine }> {
    const input = this.optimizerInput(ctx, objective, now);
    if (this.scheduler?.enabled) {
      try {
        const result = await this.scheduler.request<OptimizerResult>({
          path: '/v1/optimize',
          principal: { clinicId, userId: 'system', role: 'SYSTEM' },
          body: input,
        });
        return { result, engine: 'python' };
      } catch (error) {
        this.logger.warn(
          `python optimiser unavailable, using the TypeScript fallback: ${(error as Error).message}`,
        );
      }
    }
    return { result: optimize(input), engine: 'typescript' };
  }

  /** Minutes of average wait the MIN_WAIT optimiser would save today (0 when none). */
  async minutesSaved(clinicId: string, date: string, now = new Date()): Promise<number> {
    const ctx = await this.loadContext(clinicId, date);
    const result = this.runOptimizer(ctx, 'MIN_WAIT', now);
    return Math.round(result.before.estimatedWaitMinutes - result.after.estimatedWaitMinutes);
  }

  private toProposal(run: {
    id: string;
    date: string;
    objective: string;
    scheduleVersion: string;
    proposal: Prisma.JsonValue;
    status: string;
    appliedAt: Date | null;
    createdAt: Date;
  }): OptimizationProposal {
    const stored = run.proposal as unknown as StoredProposal;
    return {
      id: run.id,
      date: run.date,
      objective: run.objective as OptimizationObjective,
      version: run.scheduleVersion,
      status: stored.status,
      moves: stored.moves,
      before: stored.before,
      after: stored.after,
      unresolved: stored.unresolved,
      idleDoctors: stored.idleDoctors,
      createdAt: run.createdAt.toISOString(),
      state: run.status as OptimizationProposal['state'],
      undoUntil:
        run.status === 'APPLIED' && run.appliedAt
          ? new Date(run.appliedAt.getTime() + UNDO_WINDOW_MS).toISOString()
          : null,
      engine: stored.engine ?? 'typescript',
    };
  }

  async optimizeDay(
    clinicId: string,
    userId: string,
    date: string,
    objective: OptimizationObjective,
    now = new Date(),
  ): Promise<OptimizationProposal> {
    const ctx = await this.loadContext(clinicId, date);
    const { result, engine } = await this.runOptimizerPreferred(clinicId, ctx, objective, now);
    const byId = new Map(ctx.appointments.map((a) => [a.id, a]));
    const doctorNames = new Map(ctx.doctors.map((d) => [d.id, d.name]));
    const moves: ProposalMove[] = result.moves.map((m) => ({
      appointmentId: m.appointmentId,
      code: m.code,
      patientName: byId.get(m.appointmentId)?.patientName ?? '',
      fromDoctorId: m.fromDoctorId,
      toDoctorId: m.toDoctorId,
      fromStartsAt: new Date(m.fromStart).toISOString(),
      toStartsAt: new Date(m.toStart).toISOString(),
      durationMinutes: m.durationMinutes,
      reasonKey: m.reasonKey,
    }));
    const stored: StoredProposal = {
      moves,
      before: result.before,
      after: result.after,
      unresolved: result.unresolved,
      idleDoctors: result.idleDoctors.map((d) => ({
        doctorId: d.doctorId,
        name: doctorNames.get(d.doctorId) ?? '',
        freeMinutes: d.freeMinutes,
      })),
      status: result.status,
      engine,
    };
    const run = await this.prisma.optimizationRun.create({
      data: {
        clinicId,
        date,
        objective,
        scheduleVersion: this.version(ctx),
        proposal: stored as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    return this.toProposal(run);
  }

  async getProposal(clinicId: string, id: string): Promise<OptimizationProposal> {
    const run = await this.prisma.optimizationRun.findFirst({ where: { id, clinicId } });
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Proposal not found' });
    return this.toProposal(run);
  }

  private stale(message = 'The schedule changed since this proposal was made'): never {
    throw new ConflictException({ code: 'STALE_PROPOSAL', message });
  }

  /** Apply `moves` (direction 'forward' or 'back') to the in-memory day and validate it. */
  private validateMoves(
    ctx: DayContext,
    moves: ProposalMove[],
    direction: 'forward' | 'back',
  ): boolean {
    const doctors = new Map(ctx.doctors.map((d) => [d.id, d]));
    const state = new Map(
      this.active(ctx).map((a) => [
        a.id,
        { doctorId: a.doctorId, start: a.startsAt.getTime(), end: a.endsAt.getTime() },
      ]),
    );
    for (const m of moves) {
      const row = state.get(m.appointmentId);
      const expectedDoctor = direction === 'forward' ? m.fromDoctorId : m.toDoctorId;
      const expectedStart = new Date(
        direction === 'forward' ? m.fromStartsAt : m.toStartsAt,
      ).getTime();
      if (!row || row.doctorId !== expectedDoctor || row.start !== expectedStart) return false;
    }
    const moved = new Set<string>();
    for (const m of moves) {
      const row = state.get(m.appointmentId)!;
      const doctorId = direction === 'forward' ? m.toDoctorId : m.fromDoctorId;
      const start = new Date(direction === 'forward' ? m.toStartsAt : m.fromStartsAt).getTime();
      row.doctorId = doctorId;
      row.start = start;
      row.end = start + m.durationMinutes * 60_000;
      moved.add(m.appointmentId);
    }
    for (const id of moved) {
      const row = state.get(id)!;
      const doctor = doctors.get(row.doctorId);
      if (!doctor || !insideAvailability(row.start, row.end, doctor.available)) return false;
      for (const [otherId, other] of state) {
        if (
          otherId !== id &&
          other.doctorId === row.doctorId &&
          other.start < row.end &&
          row.start < other.end
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private async writeMoves(
    tx: Tx,
    ctx: DayContext,
    actor: string,
    moves: ProposalMove[],
    direction: 'forward' | 'back',
    organizationId: string | null,
  ): Promise<void> {
    for (const m of moves) {
      const from = {
        doctorId: direction === 'forward' ? m.fromDoctorId : m.toDoctorId,
        startsAt: direction === 'forward' ? m.fromStartsAt : m.toStartsAt,
      };
      const to = {
        doctorId: direction === 'forward' ? m.toDoctorId : m.fromDoctorId,
        startsAt: direction === 'forward' ? m.toStartsAt : m.fromStartsAt,
      };
      const startsAt = new Date(to.startsAt);
      await tx.appointment.update({
        where: { id: m.appointmentId },
        data: {
          doctorId: to.doctorId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + m.durationMinutes * 60_000),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor,
        action: 'update',
        entity: 'appointment',
        entityId: m.appointmentId,
        before: from,
        after: to,
        clinicId: ctx.clinicId,
        organizationId,
      });
    }
  }

  private async afterMoves(
    ctx: DayContext,
    actor: string,
    organizationId: string | null,
    runId: string,
    moves: ProposalMove[],
    direction: 'forward' | 'back',
    objective: string,
  ): Promise<void> {
    const ids = moves.map((m) => m.appointmentId);
    await this.events.emit({
      type: 'schedule.optimized',
      clinicId: ctx.clinicId,
      organizationId,
      actorUserId: actor,
      payload: { date: ctx.date, runId, appointmentIds: ids, direction },
    });
    for (const m of moves) {
      const from = direction === 'forward' ? m.fromStartsAt : m.toStartsAt;
      const to = direction === 'forward' ? m.toStartsAt : m.fromStartsAt;
      await this.events.emit({
        type: 'appointment.rescheduled',
        clinicId: ctx.clinicId,
        organizationId,
        actorUserId: actor,
        payload: {
          appointmentId: m.appointmentId,
          fromStartsAt: from,
          toStartsAt: to,
          durationMinutes: m.durationMinutes,
          doctorId: direction === 'forward' ? m.toDoctorId : m.fromDoctorId,
          fromDoctorId: direction === 'forward' ? m.fromDoctorId : m.toDoctorId,
        },
      });
    }
    if (direction !== 'forward') return;
    const doctorIds = new Set(moves.flatMap((m) => [m.fromDoctorId, m.toDoctorId]));
    for (const doctor of ctx.doctors.filter((d) => doctorIds.has(d.id) && d.userId)) {
      await this.notifications.create({
        clinicId: ctx.clinicId,
        userId: doctor.userId,
        category: 'AVAILABILITY',
        titleKey: 'notifications.templates.scheduleMoved.title',
        bodyKey: 'notifications.templates.scheduleMoved.body',
        params: {
          count: moves.filter((m) => m.fromDoctorId === doctor.id || m.toDoctorId === doctor.id)
            .length,
          date: ctx.date,
        },
        entityType: 'doctor',
        entityId: doctor.id,
        dedupeKey: `schedule.optimized:${runId}:${doctor.userId}`,
      });
    }
    await this.notifications.create({
      clinicId: ctx.clinicId,
      category: 'SYSTEM',
      titleKey: 'notifications.templates.scheduleOptimized.title',
      bodyKey: 'notifications.templates.scheduleOptimized.body',
      params: { count: ids.length, date: ctx.date, objective },
      entityType: null,
      entityId: null,
      dedupeKey: `schedule.optimized:${runId}`,
    });
  }

  private async organizationOf(clinicId: string): Promise<string | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { organizationId: true },
    });
    return clinic?.organizationId ?? null;
  }

  async apply(
    clinicId: string,
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<OptimizationProposal> {
    const organizationId = await this.organizationOf(clinicId);
    const outcome = await this.prisma.$transactionWith(async (tx) => {
      const run = await tx.optimizationRun.findFirst({ where: { id, clinicId } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Proposal not found' });
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`schedule:${clinicId}:${run.date}`}))) AS l`;
      if (run.status !== 'PROPOSED') return { kind: 'stale' as const };
      const ctx = await this.loadContext(clinicId, run.date, tx);
      const stored = run.proposal as unknown as StoredProposal;
      if (
        this.version(ctx) !== run.scheduleVersion ||
        !this.validateMoves(ctx, stored.moves, 'forward')
      ) {
        await tx.optimizationRun.update({ where: { id }, data: { status: 'REJECTED' } });
        return { kind: 'stale' as const };
      }
      await this.writeMoves(tx, ctx, userId, stored.moves, 'forward', organizationId);
      const updated = await tx.optimizationRun.update({
        where: { id },
        data: { status: 'APPLIED', appliedAt: now },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        action: 'update',
        entity: 'optimization_run',
        entityId: id,
        before: { status: 'PROPOSED' },
        after: { status: 'APPLIED', moves: stored.moves.length, objective: run.objective },
        clinicId,
        organizationId,
      });
      return { kind: 'applied' as const, run: updated, ctx, moves: stored.moves };
    });
    if (outcome.kind === 'stale') this.stale();
    await this.afterMoves(
      outcome.ctx,
      userId,
      organizationId,
      id,
      outcome.moves,
      'forward',
      outcome.run.objective,
    );
    return this.toProposal(outcome.run);
  }

  async undo(
    clinicId: string,
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<OptimizationProposal> {
    const organizationId = await this.organizationOf(clinicId);
    const outcome = await this.prisma.$transactionWith(async (tx) => {
      const run = await tx.optimizationRun.findFirst({ where: { id, clinicId } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Proposal not found' });
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`schedule:${clinicId}:${run.date}`}))) AS l`;
      if (run.status !== 'APPLIED' || !run.appliedAt) return { kind: 'stale' as const };
      if (now.getTime() > run.appliedAt.getTime() + UNDO_WINDOW_MS)
        return { kind: 'expired' as const };
      const ctx = await this.loadContext(clinicId, run.date, tx);
      const stored = run.proposal as unknown as StoredProposal;
      if (!this.validateMoves(ctx, stored.moves, 'back')) return { kind: 'stale' as const };
      await this.writeMoves(tx, ctx, userId, stored.moves, 'back', organizationId);
      const updated = await tx.optimizationRun.update({
        where: { id },
        data: { status: 'UNDONE', undoneAt: now },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        action: 'update',
        entity: 'optimization_run',
        entityId: id,
        before: { status: 'APPLIED' },
        after: { status: 'UNDONE' },
        clinicId,
        organizationId,
      });
      return { kind: 'undone' as const, run: updated, ctx, moves: stored.moves };
    });
    if (outcome.kind === 'expired') {
      throw new ConflictException({ code: 'UNDO_EXPIRED', message: 'The undo window has passed' });
    }
    if (outcome.kind === 'stale') this.stale();
    await this.afterMoves(
      outcome.ctx,
      userId,
      organizationId,
      id,
      outcome.moves,
      'back',
      outcome.run.objective,
    );
    return this.toProposal(outcome.run);
  }

  async validateMove(
    clinicId: string,
    input: { appointmentId: string; doctorId: string; startsAt: string },
    now = new Date(),
  ): Promise<MoveValidation> {
    const invalid = (key: string): MoveValidation => ({
      valid: false,
      reasonKey: `scheduling.invalid.${key}`,
    });
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: input.appointmentId, clinicId },
      include: { doctor: { select: { specialty: true } } },
    });
    if (!appointment)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Appointment not found' });
    const target = await this.prisma.doctor.findFirst({
      where: { id: input.doctorId, clinicId, isActive: true },
    });
    if (!target) return invalid('outsideHours');
    const opt: OptAppointment = {
      id: appointment.id,
      code: appointment.code,
      doctorId: appointment.doctorId,
      start: appointment.startsAt.getTime(),
      end: appointment.endsAt.getTime(),
      status: appointment.status,
      type: appointment.type,
      locked: appointment.locked,
    };
    if (
      !['SCHEDULED', 'CONFIRMED'].includes(opt.status) ||
      opt.type === 'EMERGENCY' ||
      opt.locked
    ) {
      return invalid('notMovable');
    }
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now.getTime())
      return invalid('pastTime');
    if (target.specialty !== appointment.doctor.specialty) return invalid('specialtyMismatch');
    const endsAt = new Date(startsAt.getTime() + (opt.end - opt.start));
    const settings = await this.settings.get(clinicId);
    const date = toLocalDate(startsAt, settings.clinic.timezone);
    const ctx = await this.loadContext(clinicId, date);
    const doctor = ctx.doctors.find((d) => d.id === target.id);
    if (!doctor || toLocalDate(new Date(endsAt.getTime() - 1), settings.clinic.timezone) !== date) {
      return invalid('outsideHours');
    }
    if (!isWithinAvailability({ startsAt, endsAt }, doctor.available))
      return invalid('outsideHours');
    const clash = this.active(ctx).some(
      (o) =>
        o.id !== appointment.id &&
        o.doctorId === target.id &&
        o.startsAt < endsAt &&
        startsAt < o.endsAt,
    );
    return clash ? invalid('overlap') : { valid: true };
  }
}
