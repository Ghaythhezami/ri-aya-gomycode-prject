import { OnModuleInit, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PublicDisplay,
  QueueEntryDto,
  QueuePriority,
  QueueSnapshot,
  QueueStatus,
  SelfCheckInResult,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { localDayBounds, todayIn } from '../core/clinic-time';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import {
  APPOINTMENT_LIST_INCLUDE,
  toAppointmentListItem,
  toDoctorRef,
  toPersonRef,
} from '../common/mappers';
import { NotificationsService } from '../notifications/notifications.service';
import { compareQueueEntries, formatQueueNumber, nextQueueSequence } from './queue-order';

const ENTRY_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true } },
  appointment: {
    select: {
      id: true,
      code: true,
      startsAt: true,
      status: true,
      roomId: true,
      doctor: {
        select: { id: true, firstName: true, lastName: true, specialty: true, roomId: true },
      },
    },
  },
} as const;

type EntryRow = Prisma.QueueEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;
type Tx = Prisma.TransactionClient;

interface CheckInParams {
  clinicId: string;
  appointmentId: string;
  priority?: QueuePriority;
  source: 'DESK' | 'QR';
  actorUserId: string | null;
}

@Injectable()
export class QueueService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Keep the queue in step with status changes made outside the queue screen
   * (appointment detail, row actions): a CHECKED_IN appointment always has a queue
   * entry, and IN_PROGRESS / COMPLETED / NO_SHOW close it.
   */
  onModuleInit(): void {
    this.events.on('appointment.status_changed', async (event) => {
      const appointmentId = String(event.payload.appointmentId ?? '');
      const to = String(event.payload.to ?? '');
      if (!appointmentId) return;
      const entry = await this.prisma.queueEntry.findUnique({ where: { appointmentId } });
      if (to === 'CHECKED_IN' && !entry) {
        try {
          await this.checkIn({
            clinicId: event.clinicId,
            appointmentId,
            source: 'DESK',
            actorUserId: event.actorUserId,
          });
        } catch {
          // Not today, or already queued by a concurrent request: nothing to sync.
        }
        return;
      }
      if (!entry) return;
      const now = new Date();
      const data =
        to === 'IN_PROGRESS' && entry.status !== 'IN_CONSULTATION'
          ? {
              status: 'IN_CONSULTATION' as const,
              startedAt: entry.startedAt ?? now,
              calledAt: entry.calledAt ?? now,
            }
          : to === 'COMPLETED' && entry.status !== 'COMPLETED'
            ? { status: 'COMPLETED' as const, completedAt: now }
            : to === 'NO_SHOW' && entry.status !== 'NO_SHOW'
              ? { status: 'NO_SHOW' as const }
              : null;
      if (!data) return;
      await this.prisma.queueEntry.update({ where: { id: entry.id }, data });
      await this.emitUpdated(event.clinicId, event.organizationId, event.actorUserId);
    });
  }

  // ----------------------------------------------------------------- reads

  private async dayBounds(clinicId: string, now = new Date()) {
    const settings = await this.settings.get(clinicId);
    const timeZone = settings.clinic.timezone;
    const date = todayIn(timeZone, now);
    return { settings, timeZone, date, ...localDayBounds(date, timeZone) };
  }

  private toDto(row: EntryRow, targetWaitMinutes: number, now: Date): QueueEntryDto {
    const until = row.calledAt ?? row.startedAt ?? now;
    const waitingMinutes = Math.max(
      0,
      Math.round((until.getTime() - row.checkedInAt.getTime()) / 60_000),
    );
    const room = row.room ?? null;
    return {
      id: row.id,
      number: row.number,
      appointmentId: row.appointmentId,
      appointmentCode: row.appointment.code,
      patient: toPersonRef(row.patient),
      doctor: toDoctorRef(row.appointment.doctor),
      room: room ? { id: room.id, name: room.name } : null,
      appointmentTime: row.appointment.startsAt.toISOString(),
      checkedInAt: row.checkedInAt.toISOString(),
      calledAt: row.calledAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      priority: row.priority as QueuePriority,
      status: row.status as QueueStatus,
      source: row.source === 'QR' ? 'QR' : 'DESK',
      waitingMinutes,
      overTarget: waitingMinutes > targetWaitMinutes,
      delayMinutes: row.delayMinutes,
    };
  }

  private comparable(row: EntryRow) {
    return {
      number: row.number,
      priority: row.priority,
      appointmentStartsAt: row.appointment.startsAt.getTime(),
      checkedInAt: row.checkedInAt.getTime(),
    };
  }

  async snapshot(clinicId: string, now = new Date()): Promise<QueueSnapshot> {
    const { settings, start, end } = await this.dayBounds(clinicId, now);
    const rows = await this.prisma.queueEntry.findMany({
      where: { clinicId, checkedInAt: { gte: start, lt: end } },
      include: ENTRY_INCLUDE,
    });
    const target = settings.targetWaitMinutes;
    const rank = (s: string) => (s === 'IN_CONSULTATION' ? 0 : s === 'CALLED' ? 1 : 2);
    const live = rows
      .filter((r) => ['WAITING', 'CALLED', 'IN_CONSULTATION'].includes(r.status))
      .sort(
        (a, b) =>
          rank(a.status) - rank(b.status) ||
          compareQueueEntries(this.comparable(a), this.comparable(b)),
      );
    const finished = rows
      .filter((r) => !live.includes(r))
      .sort(
        (a, b) =>
          (b.completedAt ?? b.updatedAt).getTime() - (a.completedAt ?? a.updatedAt).getTime(),
      );
    const entries = [...live, ...finished].map((r) => this.toDto(r, target, now));

    const waiting = entries.filter((e) => e.status === 'WAITING');
    const longest = waiting.reduce<QueueEntryDto | null>(
      (best, e) => (!best || e.waitingMinutes > best.waitingMinutes ? e : best),
      null,
    );
    const average = entries.length
      ? Math.round(entries.reduce((s, e) => s + e.waitingMinutes, 0) / entries.length)
      : 0;

    const expected = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        startsAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        queueEntry: null,
      },
      include: APPOINTMENT_LIST_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });

    return {
      summary: {
        waiting: waiting.length,
        inConsultation: entries.filter((e) => e.status === 'IN_CONSULTATION').length,
        averageWaitMinutes: average,
        longestWaitMinutes: longest?.waitingMinutes ?? 0,
        longestWaitNumber: longest?.number ?? null,
        checkedInToday: entries.length,
        completedToday: entries.filter((e) => e.status === 'COMPLETED').length,
        targetWaitMinutes: target,
      },
      entries,
      expected: expected.map(toAppointmentListItem),
      updatedAt: now.toISOString(),
    };
  }

  /** Public waiting-room display: numbers and room names only. */
  async publicDisplay(clinicId: string, now = new Date()): Promise<PublicDisplay> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });
    if (!clinic) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Clinic not found' });
    const { start, end } = await this.dayBounds(clinicId, now);
    const rows = await this.prisma.queueEntry.findMany({
      where: {
        clinicId,
        checkedInAt: { gte: start, lt: end },
        status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
      },
      include: ENTRY_INCLUDE,
    });
    const serving = rows
      .filter((r) => r.status !== 'WAITING')
      .sort((a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0));
    const waiting = rows
      .filter((r) => r.status === 'WAITING')
      .sort((a, b) => compareQueueEntries(this.comparable(a), this.comparable(b)));
    return {
      clinicName: clinic.name,
      nowServing: serving.map((r) => ({ number: r.number, room: r.room?.name ?? null })),
      waiting: waiting.map((r) => ({ number: r.number })),
      updatedAt: now.toISOString(),
    };
  }

  // ------------------------------------------------------------- mutations

  private async load(clinicId: string, id: string): Promise<EntryRow> {
    const row = await this.prisma.queueEntry.findFirst({
      where: { id, clinicId },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Queue entry not found' });
    return row;
  }

  private illegal(message: string): never {
    throw new ConflictException({ code: 'ILLEGAL_TRANSITION', message });
  }

  private async respond(clinicId: string, id: string): Promise<QueueEntryDto> {
    const now = new Date();
    const settings = await this.settings.get(clinicId);
    return this.toDto(await this.load(clinicId, id), settings.targetWaitMinutes, now);
  }

  private async emitUpdated(clinicId: string, organizationId: string | null, actor: string | null) {
    const { date } = await this.dayBounds(clinicId);
    const snapshot = await this.snapshot(clinicId);
    await this.events.emit({
      type: 'queue.updated',
      clinicId,
      organizationId,
      actorUserId: actor,
      payload: {
        date,
        waiting: snapshot.summary.waiting,
        inProgress: snapshot.summary.inConsultation,
        completed: snapshot.summary.completedToday,
      },
    });
  }

  private async organizationOf(clinicId: string): Promise<string | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { organizationId: true },
    });
    return clinic?.organizationId ?? null;
  }

  private async statusChange(
    tx: Tx,
    p: { clinicId: string; organizationId: string | null; actor: string | null },
    appointmentId: string,
    from: string,
    to: 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
  ) {
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: to } });
    await this.audit.record(tx, {
      actorUserId: p.actor,
      action: 'update',
      entity: 'appointment',
      entityId: appointmentId,
      before: { status: from },
      after: { status: to },
      clinicId: p.clinicId,
      organizationId: p.organizationId,
    });
  }

  async checkIn(params: CheckInParams): Promise<QueueEntryDto & { position: number }> {
    const { clinicId, appointmentId } = params;
    const organizationId = await this.organizationOf(clinicId);
    const { start, end, date } = await this.dayBounds(clinicId);
    let entryId: string;
    let fromStatus = '';
    try {
      entryId = await this.prisma.$transactionWith(async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id: appointmentId, clinicId, startsAt: { gte: start, lt: end } },
          include: { queueEntry: true },
        });
        if (!appointment) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: 'Appointment not found today',
          });
        }
        if (appointment.queueEntry) {
          throw new ConflictException({
            code: 'ALREADY_CHECKED_IN',
            message: 'Already checked in',
          });
        }
        fromStatus = appointment.status;
        if (!['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status)) {
          this.illegal(`Cannot check in a ${appointment.status} appointment`);
        }
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`queue:${clinicId}:${date}`}))) AS l`;
        const numbers = await tx.queueEntry.findMany({
          where: { clinicId, checkedInAt: { gte: start, lt: end } },
          select: { number: true },
        });
        const number = formatQueueNumber(nextQueueSequence(numbers.map((n) => n.number)));
        const priority: QueuePriority =
          params.priority ?? (appointment.type === 'EMERGENCY' ? 'EMERGENCY' : 'NORMAL');
        const created = await tx.queueEntry.create({
          data: {
            clinicId,
            appointmentId,
            patientId: appointment.patientId,
            number,
            priority,
            source: params.source,
            status: 'WAITING',
          },
        });
        if (appointment.status !== 'CHECKED_IN') {
          await this.statusChange(
            tx,
            { clinicId, organizationId, actor: params.actorUserId },
            appointmentId,
            appointment.status,
            'CHECKED_IN',
          );
        }
        return created.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_CHECKED_IN', message: 'Already checked in' });
      }
      throw error;
    }
    if (fromStatus !== 'CHECKED_IN') {
      await this.events.emit({
        type: 'appointment.status_changed',
        clinicId,
        organizationId,
        actorUserId: params.actorUserId,
        payload: { appointmentId, from: fromStatus, to: 'CHECKED_IN' },
      });
    }
    await this.emitUpdated(clinicId, organizationId, params.actorUserId);
    const dto = await this.respond(clinicId, entryId);
    const snapshot = await this.snapshot(clinicId);
    const waitingNow = snapshot.entries.filter((e) => e.status === 'WAITING').map((e) => e.id);
    return { ...dto, position: Math.max(1, waitingNow.indexOf(dto.id) + 1) };
  }

  async selfCheckIn(
    clinicId: string,
    appointmentCode: string,
    phoneLast4: string,
  ): Promise<SelfCheckInResult> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Clinic not found' });
    const notFound = () =>
      new NotFoundException({ code: 'CHECK_IN_NOT_FOUND', message: 'No matching appointment' });
    const { start, end } = await this.dayBounds(clinicId);
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        clinicId,
        code: { equals: appointmentCode.trim(), mode: 'insensitive' },
        startsAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] },
      },
      include: { patient: { select: { phone: true } } },
    });
    const digits = appointment?.patient.phone.replace(/\D/g, '') ?? '';
    if (!appointment || !digits.endsWith(phoneLast4)) throw notFound();
    const result = await this.checkIn({
      clinicId,
      appointmentId: appointment.id,
      source: 'QR',
      actorUserId: null,
    });
    return { number: result.number, position: result.position };
  }

  async callNext(clinicId: string, actor: string, doctorId?: string): Promise<QueueEntryDto> {
    const organizationId = await this.organizationOf(clinicId);
    const { start, end } = await this.dayBounds(clinicId);
    const id = await this.prisma.$transactionWith(async (tx) => {
      const doctorFilter = doctorId ? Prisma.sql`AND a."doctorId" = ${doctorId}` : Prisma.empty;
      const picked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT q.id FROM queue_entries q
        JOIN appointments a ON a.id = q."appointmentId"
        WHERE q."clinicId" = ${clinicId}
          AND q.status = 'WAITING'
          AND q."checkedInAt" >= ${start} AND q."checkedInAt" < ${end}
          ${doctorFilter}
        ORDER BY CASE q.priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END,
                 a."startsAt" ASC, q."checkedInAt" ASC, q.number ASC
        LIMIT 1
        FOR UPDATE OF q SKIP LOCKED`);
      const first = picked[0];
      if (!first) throw new NotFoundException({ code: 'QUEUE_EMPTY', message: 'Queue is empty' });
      const entry = await tx.queueEntry.findUniqueOrThrow({
        where: { id: first.id },
        include: {
          appointment: { select: { roomId: true, doctor: { select: { roomId: true } } } },
        },
      });
      await tx.queueEntry.update({
        where: { id: first.id },
        data: {
          status: 'CALLED',
          calledAt: new Date(),
          roomId: entry.appointment.doctor.roomId ?? entry.appointment.roomId ?? null,
        },
      });
      return first.id;
    });
    await this.emitUpdated(clinicId, organizationId, actor);
    return this.respond(clinicId, id);
  }

  async start(clinicId: string, actor: string, id: string): Promise<QueueEntryDto> {
    const organizationId = await this.organizationOf(clinicId);
    const entry = await this.load(clinicId, id);
    if (!['WAITING', 'CALLED'].includes(entry.status)) this.illegal('Entry cannot be started');
    const from = entry.appointment.status;
    await this.prisma.$transactionWith(async (tx) => {
      await tx.queueEntry.update({
        where: { id },
        data: {
          status: 'IN_CONSULTATION',
          startedAt: new Date(),
          calledAt: entry.calledAt ?? new Date(),
        },
      });
      await this.statusChange(
        tx,
        { clinicId, organizationId, actor },
        entry.appointmentId,
        from,
        'IN_PROGRESS',
      );
    });
    await this.afterStatus(
      clinicId,
      organizationId,
      actor,
      entry.appointmentId,
      from,
      'IN_PROGRESS',
    );
    return this.respond(clinicId, id);
  }

  async complete(clinicId: string, actor: string, id: string): Promise<QueueEntryDto> {
    const organizationId = await this.organizationOf(clinicId);
    const entry = await this.load(clinicId, id);
    if (entry.status !== 'IN_CONSULTATION') this.illegal('Entry is not in consultation');
    const from = entry.appointment.status;
    await this.prisma.$transactionWith(async (tx) => {
      await tx.queueEntry.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await this.statusChange(
        tx,
        { clinicId, organizationId, actor },
        entry.appointmentId,
        from,
        'COMPLETED',
      );
    });
    await this.afterStatus(clinicId, organizationId, actor, entry.appointmentId, from, 'COMPLETED');
    return this.respond(clinicId, id);
  }

  async noShow(clinicId: string, actor: string, id: string): Promise<QueueEntryDto> {
    const organizationId = await this.organizationOf(clinicId);
    const entry = await this.load(clinicId, id);
    if (!['WAITING', 'CALLED'].includes(entry.status))
      this.illegal('Entry cannot be marked no-show');
    const from = entry.appointment.status;
    await this.prisma.$transactionWith(async (tx) => {
      await tx.queueEntry.update({
        where: { id },
        data: { status: 'NO_SHOW', completedAt: new Date() },
      });
      await this.statusChange(
        tx,
        { clinicId, organizationId, actor },
        entry.appointmentId,
        from,
        'NO_SHOW',
      );
    });
    await this.afterStatus(clinicId, organizationId, actor, entry.appointmentId, from, 'NO_SHOW');
    return this.respond(clinicId, id);
  }

  private async afterStatus(
    clinicId: string,
    organizationId: string | null,
    actor: string,
    appointmentId: string,
    from: string,
    to: string,
  ) {
    await this.events.emit({
      type: 'appointment.status_changed',
      clinicId,
      organizationId,
      actorUserId: actor,
      payload: { appointmentId, from, to },
    });
    await this.emitUpdated(clinicId, organizationId, actor);
  }

  async notifyDelay(
    clinicId: string,
    actor: string,
    id: string,
    minutes: number,
  ): Promise<QueueEntryDto> {
    const organizationId = await this.organizationOf(clinicId);
    const entry = await this.load(clinicId, id);
    if (!['WAITING', 'CALLED'].includes(entry.status)) this.illegal('Entry is no longer waiting');
    await this.prisma.queueEntry.update({ where: { id }, data: { delayMinutes: minutes } });
    await this.notifications.create({
      clinicId,
      category: 'DELAY',
      titleKey: 'notifications.templates.delay.title',
      bodyKey: 'notifications.templates.delay.body',
      params: {
        number: entry.number,
        patient: `${entry.patient.firstName} ${entry.patient.lastName}`.trim(),
        minutes,
        code: entry.appointment.code,
      },
      entityType: 'queue',
      entityId: id,
      dedupeKey: `queue.delay:${id}:${minutes}:${Date.now()}`,
    });
    await this.emitUpdated(clinicId, organizationId, actor);
    return this.respond(clinicId, id);
  }

  async setPriority(clinicId: string, actor: string, id: string, priority: QueuePriority) {
    const organizationId = await this.organizationOf(clinicId);
    await this.load(clinicId, id);
    await this.prisma.queueEntry.update({ where: { id }, data: { priority } });
    await this.emitUpdated(clinicId, organizationId, actor);
    return this.respond(clinicId, id);
  }
}
