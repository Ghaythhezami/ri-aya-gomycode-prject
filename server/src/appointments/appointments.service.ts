import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPOINTMENT_STATUSES,
  CLINIC_ERROR_CODES,
  type AlternativeSlot,
  type AppointmentDetail,
  type AppointmentListItem,
  type AppointmentStatus,
  type AppointmentType,
  type BulkActionResult,
  type ClinicErrorCode,
  type Paginated,
  type ReminderDto,
  type SlotLock,
} from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AppointmentTypesService } from '../appointment-types/appointment-types.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../events/domain-events.service';
import { DomainEventType } from '../events/domain-events';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { generateSlots, isWithinAvailability } from '../core/availability';
import { localDayBounds, toLocalDate } from '../core/clinic-time';
import { DoctorsService } from '../doctors/doctors.service';
import { availableForDates, candidateDates } from '../doctors/availability-window';
import { paginated, parseSort, resolvePagination } from '../common/pagination';
import { APPOINTMENT_LIST_INCLUDE, doctorName, toAppointmentListItem } from '../common/mappers';
import {
  allowedTransitions,
  assertTransition,
  illegalTransition,
  isEditable,
} from './appointment-state';
import { selectAlternatives, type CandidateSlot } from './alternatives';
import { isSerializationFailure, isSlotConflictError } from './conflict-errors';
import { KeyedMutex } from './keyed-mutex';
import { SlotLockService } from './slot-lock.service';
import {
  BulkActionDto,
  CreateAppointmentDto,
  CreateLockDto,
  ChangeAppointmentTypeDto,
  ListAppointmentsQueryDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

const FREED = ['CANCELLED', 'NO_SHOW'] as ('CANCELLED' | 'NO_SHOW')[];
const DAY_MS = 24 * 3600_000;
const MINUTE = 60_000;
const LIST_SORTS = ['startsAt', 'code', 'patient', 'doctor', 'type', 'status'] as const;
const CALENDAR_LIMIT = 2000;
const BOOKING_ATTEMPTS = 4;

const DETAIL_INCLUDE = {
  ...APPOINTMENT_LIST_INCLUDE,
  reminders: { orderBy: { scheduledFor: 'asc' } },
} satisfies Prisma.AppointmentInclude;

type DetailRow = Prisma.AppointmentGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Internal signal: the slot is taken. Converted to 409 SLOT_CONFLICT with alternatives. */
class SlotTaken extends Error {}

function notFound(message = 'Appointment not found') {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

function validation(message: string, details?: unknown) {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message, details });
}

function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validation(`Invalid ${field}`, { field });
  return date;
}

function toReminderDto(r: DetailRow['reminders'][number]): ReminderDto {
  return {
    id: r.id,
    channel: r.channel === 'EMAIL' ? 'EMAIL' : 'SMS',
    offsetMinutes: r.offsetMinutes,
    scheduledFor: r.scheduledFor.toISOString(),
    status: r.status,
    sentAt: r.sentAt?.toISOString() ?? null,
    error: r.error,
  };
}

function toDetail(row: DetailRow): AppointmentDetail {
  return {
    ...toAppointmentListItem(row),
    notes: row.notes,
    cancelReason: row.cancelReason,
    allowedTransitions: allowedTransitions(row.status),
    reminders: row.reminders.map(toReminderDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function snapshot(row: {
  patientId: string;
  doctorId: string;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  type: string;
  reason: string | null;
  notes: string | null;
  cancelReason?: string | null;
  locked: boolean;
  needsReschedule: boolean;
}) {
  return {
    patientId: row.patientId,
    doctorId: row.doctorId,
    roomId: row.roomId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    type: row.type,
    reason: row.reason,
    notes: row.notes,
    cancelReason: row.cancelReason ?? null,
    locked: row.locked,
    needsReschedule: row.needsReschedule,
  };
}

/**
 * Audit actor column references `users`; a portal request carries a synthetic `portal:<accountId>`
 * user id (no user row), so it is stored as no actor. The portal service records its own audit row.
 */
function auditActor(scope: TenantScope): string | null {
  return scope.userId.startsWith('portal:') ? null : scope.userId;
}

function errorCode(error: unknown): ClinicErrorCode {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    const code = typeof body === 'object' && body ? (body as { code?: string }).code : undefined;
    if (code && (CLINIC_ERROR_CODES as readonly string[]).includes(code)) {
      return code as ClinicErrorCode;
    }
  }
  return 'VALIDATION_FAILED';
}

@Injectable()
export class AppointmentsService {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly settings: ClinicSettingsReader,
    private readonly locks: SlotLockService,
    private readonly doctors: DoctorsService,
    private readonly types: AppointmentTypesService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private emit(
    scope: TenantScope,
    type: DomainEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.events.emit({
      type,
      clinicId: scope.clinicId,
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      payload,
    });
  }

  private async loadDetail(clinicId: string, id: string): Promise<DetailRow> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw notFound();
    return row;
  }

  // ------------------------------------------------------------------ list / calendar

  private async buildWhere(
    scope: TenantScope,
    query: ListAppointmentsQueryDto,
    timeZone: string,
  ): Promise<Prisma.AppointmentWhereInput> {
    const where: Prisma.AppointmentWhereInput = { clinicId: scope.clinicId };

    const startsAt: Prisma.DateTimeFilter = {};
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (query.from) {
      startsAt.gte = dateOnly.test(query.from)
        ? localDayBounds(query.from, timeZone).start
        : parseInstant(query.from, 'from');
    }
    if (query.to) {
      if (dateOnly.test(query.to)) startsAt.lt = localDayBounds(query.to, timeZone).end;
      else startsAt.lte = parseInstant(query.to, 'to');
    }
    if (startsAt.gte || startsAt.lt || startsAt.lte) where.startsAt = startsAt;

    let doctorId = query.doctorId;
    if (scope.role === 'DOCTOR') doctorId = (await this.doctors.ownDoctorId(scope)) ?? doctorId;
    if (doctorId) where.doctorId = doctorId;
    if (query.specialty) {
      where.doctor = { specialty: { equals: query.specialty.trim(), mode: 'insensitive' } };
    }

    if (query.status) {
      const statuses = query.status.split(',').map((s) => s.trim().toUpperCase());
      if (!statuses.every((s) => (APPOINTMENT_STATUSES as readonly string[]).includes(s))) {
        throw validation('Invalid status filter', { status: query.status });
      }
      where.status = { in: statuses as AppointmentStatus[] };
    }
    if (query.type) {
      const types = query.type.split(',').map((s) => s.trim().toUpperCase());
      const known = await this.types.byCode(scope.clinicId);
      if (!types.every((s) => known.has(s))) {
        throw validation('Invalid type filter', { type: query.type });
      }
      where.type = { in: types as AppointmentType[] };
    }

    const search = query.search?.trim();
    if (search) {
      const terms = search.split(/\s+/).filter(Boolean);
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { patient: { code: { contains: search, mode: 'insensitive' } } },
        {
          patient: {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          },
        },
      ];
    }
    return where;
  }

  async list(query: ListAppointmentsQueryDto): Promise<Paginated<AppointmentListItem>> {
    const scope = this.tenant.get();
    const { clinic } = await this.settings.get(scope.clinicId);
    const where = await this.buildWhere(scope, query, clinic.timezone);
    const { page, limit, skip, take } = resolvePagination(query);
    const sort = parseSort(query.sort, LIST_SORTS, 'startsAt');
    const direction = sort.direction;
    const orderBy: Prisma.AppointmentOrderByWithRelationInput[] =
      sort.field === 'patient'
        ? [
            { patient: { lastName: direction } },
            { patient: { firstName: direction } },
            { startsAt: 'asc' },
          ]
        : sort.field === 'doctor'
          ? [
              { doctor: { lastName: direction } },
              { doctor: { firstName: direction } },
              { startsAt: 'asc' },
            ]
          : sort.field === 'status'
            ? [{ status: direction }, { startsAt: 'asc' }]
            : sort.field === 'code'
              ? [{ code: direction }]
              : sort.field === 'type'
                ? [{ type: direction }, { startsAt: 'asc' }]
                : [{ startsAt: direction }, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: APPOINTMENT_LIST_INCLUDE,
        orderBy,
        skip,
        take,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return paginated(rows.map(toAppointmentListItem), page, limit, total);
  }

  async calendar(query: ListAppointmentsQueryDto): Promise<AppointmentListItem[]> {
    const scope = this.tenant.get();
    const { clinic } = await this.settings.get(scope.clinicId);
    const where = await this.buildWhere(scope, query, clinic.timezone);
    const rows = await this.prisma.appointment.findMany({
      where,
      include: APPOINTMENT_LIST_INCLUDE,
      orderBy: { startsAt: 'asc' },
      take: CALENDAR_LIMIT,
    });
    return rows.map(toAppointmentListItem);
  }

  async get(id: string): Promise<AppointmentDetail> {
    return toDetail(await this.loadDetail(this.tenant.get().clinicId, id));
  }

  // ------------------------------------------------------------------ availability + conflicts

  /** 422 unless [start, end) lies inside the doctor's availability (emergencies exempt). */
  private async assertWithinHours(
    clinicId: string,
    doctorId: string,
    isEmergency: boolean,
    start: Date,
    end: Date,
    timeZone: string,
  ): Promise<void> {
    if (isEmergency) return;
    const [rules, leaves] = await Promise.all([
      this.prisma.workingHour.findMany({ where: { doctorId, doctor: { clinicId } } }),
      this.prisma.doctorLeave.findMany({
        where: {
          doctorId,
          endsAt: { gt: new Date(start.getTime() - DAY_MS) },
          startsAt: { lt: new Date(end.getTime() + DAY_MS) },
        },
      }),
    ]);
    const available = availableForDates(candidateDates(start, timeZone), timeZone, rules, leaves);
    if (!isWithinAvailability({ startsAt: start, endsAt: end }, available)) {
      throw new UnprocessableEntityException({
        code: 'OUTSIDE_WORKING_HOURS',
        message: 'The requested time is outside the doctor working hours',
      });
    }
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    p: {
      clinicId: string;
      doctorId: string;
      roomId?: string | null;
      start: Date;
      end: Date;
      excludeId?: string;
    },
  ): Promise<void> {
    const clash = await tx.appointment.findFirst({
      where: {
        clinicId: p.clinicId,
        status: { notIn: FREED },
        startsAt: { lt: p.end },
        endsAt: { gt: p.start },
        ...(p.excludeId ? { id: { not: p.excludeId } } : {}),
        OR: [{ doctorId: p.doctorId }, ...(p.roomId ? [{ roomId: p.roomId }] : [])],
      },
      select: { id: true },
    });
    if (clash) throw new SlotTaken();
  }

  /**
   * Runs `fn` in a SERIALIZABLE transaction, queued per doctor. Serialization
   * failures are retried (the retry then sees the committed rival and reports a
   * clean SlotTaken); an exclusion-constraint violation is final.
   */
  private runBooking<T>(
    doctorId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.mutex.run(doctorId, async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await this.prisma.$transactionWith(fn, {
            isolationLevel: 'Serializable',
            timeout: 15_000,
          });
        } catch (error) {
          if (error instanceof SlotTaken || error instanceof HttpException) throw error;
          const code = (error as { code?: string }).code;
          const retryable = code === 'P2002' || isSerializationFailure(error);
          if (retryable && attempt < BOOKING_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * attempt));
            continue;
          }
          if (isSlotConflictError(error) || code === 'P2002') throw new SlotTaken();
          throw error;
        }
      }
    });
  }

  private async nextCode(tx: Prisma.TransactionClient, clinicId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 1000)::int AS max
      FROM appointments WHERE "clinicId" = ${clinicId} AND code ~ '^AP-[0-9]+$'`;
    return `AP-${(rows[0]?.max ?? 1000) + 1}`;
  }

  private async slotConflict(
    clinicId: string,
    doctorId: string,
    start: Date,
    durationMinutes: number,
    timeZone: string,
    slotMinutes: number,
  ): Promise<ConflictException> {
    const alternatives = await this.findAlternatives(
      clinicId,
      doctorId,
      start,
      durationMinutes,
      timeZone,
      slotMinutes,
    );
    return new ConflictException({
      code: 'SLOT_CONFLICT',
      message: 'The requested slot is no longer available',
      details: { alternatives },
    });
  }

  private lockedError() {
    return new ConflictException({
      code: 'SLOT_LOCKED',
      message: 'This slot is being booked by another user',
    });
  }

  // ------------------------------------------------------------------ alternatives

  async findAlternatives(
    clinicId: string,
    doctorId: string,
    start: Date,
    durationMinutes: number,
    timeZone: string,
    slotMinutes: number,
  ): Promise<AlternativeSlot[]> {
    const requested = await this.prisma.doctor.findFirst({
      where: { id: doctorId, clinicId },
      select: { specialty: true },
    });
    if (!requested) return [];
    const date = toLocalDate(start, timeZone);
    const bounds = localDayBounds(date, timeZone);
    const windowEnd = new Date(bounds.end.getTime() + DAY_MS);
    const doctors = await this.prisma.doctor.findMany({
      where: {
        clinicId,
        isActive: true,
        OR: [
          { id: doctorId },
          {
            specialty: { equals: requested.specialty, mode: 'insensitive' },
            id: { not: doctorId },
          },
        ],
      },
      include: {
        workingHours: true,
        leaves: { where: { endsAt: { gt: bounds.start }, startsAt: { lt: windowEnd } } },
      },
    });
    if (doctors.length === 0) return [];
    const busyRows = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        doctorId: { in: doctors.map((d) => d.id) },
        startsAt: { lt: windowEnd },
        endsAt: { gt: bounds.start },
        status: { notIn: FREED },
      },
      select: { doctorId: true, startsAt: true, endsAt: true },
    });
    const now = new Date();
    const candidates = (own: boolean): CandidateSlot[] =>
      doctors
        .filter((d) => (d.id === doctorId) === own)
        .flatMap((d) =>
          generateSlots({
            date,
            timeZone,
            rules: d.workingHours,
            leaves: d.leaves,
            busy: busyRows.filter((b) => b.doctorId === d.id),
            durationMinutes,
            stepMinutes: slotMinutes,
            now,
          })
            .filter((s) => s.available)
            .slice(0, own ? undefined : 3)
            .map((s) => ({
              doctorId: d.id,
              doctorName: doctorName(d),
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              period: s.period,
            })),
        );
    return selectAlternatives({
      requestedStart: start,
      sameDoctor: candidates(true),
      sameSpecialty: candidates(false),
    });
  }

  async alternativesFor(id: string): Promise<AlternativeSlot[]> {
    const scope = this.tenant.get();
    const row = await this.loadDetail(scope.clinicId, id);
    const settings = await this.settings.get(scope.clinicId);
    return this.findAlternatives(
      scope.clinicId,
      row.doctorId,
      row.startsAt,
      Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / MINUTE),
      settings.clinic.timezone,
      settings.slotMinutes,
    );
  }

  // ------------------------------------------------------------------ create

  async create(
    dto: CreateAppointmentDto,
    opts: { source?: 'STAFF' | 'PORTAL' | 'ASSISTANT' } = {},
  ): Promise<AppointmentDetail> {
    const scope = this.tenant.get();
    const settings = await this.settings.get(scope.clinicId);
    const timeZone = settings.clinic.timezone;
    const startsAt = parseInstant(dto.startsAt, 'startsAt');
    const typeDef = await this.types.requireActive(scope.clinicId, dto.type);
    const duration = dto.durationMinutes ?? typeDef.durationMinutes;
    const endsAt = new Date(startsAt.getTime() + duration * MINUTE);

    const held = await this.locks.get(dto.doctorId, startsAt);
    if (held && held.userId !== scope.userId) throw this.lockedError();

    const [patient, doctor, room] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: dto.patientId, clinicId: scope.clinicId } }),
      this.prisma.doctor.findFirst({ where: { id: dto.doctorId, clinicId: scope.clinicId } }),
      dto.roomId
        ? this.prisma.room.findFirst({ where: { id: dto.roomId, clinicId: scope.clinicId } })
        : Promise.resolve(null),
    ]);
    if (!patient) throw notFound('Patient not found');
    if (!doctor) throw notFound('Doctor not found');
    if (dto.roomId && !room) throw notFound('Room not found');
    if (patient.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Patient is archived',
        details: { field: 'patientId' },
      });
    }
    if (!doctor.isActive) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Doctor is not active',
        details: { field: 'doctorId' },
      });
    }

    await this.assertWithinHours(
      scope.clinicId,
      doctor.id,
      typeDef.isEmergency,
      startsAt,
      endsAt,
      timeZone,
    );

    let created: DetailRow;
    try {
      created = await this.runBooking(doctor.id, async (tx) => {
        await this.assertNoOverlap(tx, {
          clinicId: scope.clinicId,
          doctorId: doctor.id,
          roomId: dto.roomId,
          start: startsAt,
          end: endsAt,
        });
        const code = await this.nextCode(tx, scope.clinicId);
        const row = await tx.appointment.create({
          data: {
            clinicId: scope.clinicId,
            code,
            patientId: patient.id,
            doctorId: doctor.id,
            roomId: dto.roomId ?? doctor.roomId ?? null,
            startsAt,
            endsAt,
            status: 'SCHEDULED',
            type: dto.type,
            reason: dto.reason ?? null,
            notes: dto.notes ?? null,
            reminderChannels: dto.reminderChannels ?? settings.reminderChannels,
            source: opts.source ?? 'STAFF',
            createdById: scope.userId,
          },
          include: DETAIL_INCLUDE,
        });
        await this.audit.record(tx, {
          actorUserId: auditActor(scope),
          action: 'create',
          entity: 'appointment',
          entityId: row.id,
          after: snapshot(row),
        });
        return row;
      });
    } catch (error) {
      if (error instanceof SlotTaken) {
        throw await this.slotConflict(
          scope.clinicId,
          doctor.id,
          startsAt,
          duration,
          timeZone,
          settings.slotMinutes,
        );
      }
      throw error;
    }

    if (dto.lockToken) await this.locks.release(dto.lockToken);
    else if (held) await this.locks.release(held.token);
    await this.emit(scope, 'appointment.created', {
      appointmentId: created.id,
      doctorId: created.doctorId,
      startsAt: created.startsAt.toISOString(),
      durationMinutes: duration,
      status: created.status,
      patientId: created.patientId,
    });
    return toDetail(created);
  }

  // ------------------------------------------------------------------ update / reschedule

  async update(
    id: string,
    dto: UpdateAppointmentDto,
    opts: { typeChange?: boolean } = {},
  ): Promise<AppointmentDetail> {
    const scope = this.tenant.get();
    const existing = await this.loadDetail(scope.clinicId, id);
    if (!isEditable(existing.status)) throw illegalTransition(existing.status, existing.status);

    const settings = await this.settings.get(scope.clinicId);
    const timeZone = settings.clinic.timezone;
    const oldDuration = Math.round(
      (existing.endsAt.getTime() - existing.startsAt.getTime()) / MINUTE,
    );
    const doctorId = dto.doctorId ?? existing.doctorId;
    const startsAt = dto.startsAt ? parseInstant(dto.startsAt, 'startsAt') : existing.startsAt;
    const duration = dto.durationMinutes ?? oldDuration;
    const endsAt = new Date(startsAt.getTime() + duration * MINUTE);
    const type = dto.type ?? (existing.type as AppointmentType);
    const typeDef =
      type !== existing.type
        ? await this.types.requireActive(scope.clinicId, type)
        : (await this.types.byCode(scope.clinicId)).get(type);
    const roomId = dto.roomId === undefined ? existing.roomId : dto.roomId;

    const doctorChanged = doctorId !== existing.doctorId;
    const timeChanged =
      doctorChanged ||
      startsAt.getTime() !== existing.startsAt.getTime() ||
      endsAt.getTime() !== existing.endsAt.getTime();
    const roomChanged = roomId !== existing.roomId;

    if (doctorChanged) {
      const doctor = await this.prisma.doctor.findFirst({
        where: { id: doctorId, clinicId: scope.clinicId },
      });
      if (!doctor) throw notFound('Doctor not found');
      if (!doctor.isActive) {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_FAILED',
          message: 'Doctor is not active',
          details: { field: 'doctorId' },
        });
      }
    }
    if (roomChanged && roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: roomId, clinicId: scope.clinicId },
      });
      if (!room) throw notFound('Room not found');
    }
    if (timeChanged) {
      const held = await this.locks.get(doctorId, startsAt);
      if (held && held.userId !== scope.userId) throw this.lockedError();
      await this.assertWithinHours(
        scope.clinicId,
        doctorId,
        typeDef?.isEmergency ?? false,
        startsAt,
        endsAt,
        timeZone,
      );
    }

    let updated: DetailRow;
    try {
      updated = await this.runBooking(doctorId, async (tx) => {
        if (timeChanged || roomChanged) {
          await this.assertNoOverlap(tx, {
            clinicId: scope.clinicId,
            doctorId,
            roomId: roomChanged ? roomId : undefined,
            start: startsAt,
            end: endsAt,
            excludeId: id,
          });
        }
        const row = await tx.appointment.update({
          where: { id },
          data: {
            doctorId,
            startsAt,
            endsAt,
            type,
            roomId,
            ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
            ...(dto.locked !== undefined ? { locked: dto.locked } : {}),
            ...(timeChanged ? { needsReschedule: false } : {}),
          },
          include: DETAIL_INCLUDE,
        });
        await this.audit.record(tx, {
          actorUserId: auditActor(scope),
          action: 'update',
          entity: 'appointment',
          entityId: id,
          before: snapshot(existing),
          after: snapshot(row),
        });
        return row;
      });
    } catch (error) {
      if (error instanceof SlotTaken) {
        throw await this.slotConflict(
          scope.clinicId,
          doctorId,
          startsAt,
          duration,
          timeZone,
          settings.slotMinutes,
        );
      }
      throw error;
    }

    if (timeChanged && !opts.typeChange) {
      await this.emit(scope, 'appointment.rescheduled', {
        appointmentId: id,
        fromStartsAt: existing.startsAt.toISOString(),
        toStartsAt: updated.startsAt.toISOString(),
        durationMinutes: duration,
        doctorId: updated.doctorId,
        fromDoctorId: existing.doctorId,
      });
    } else {
      await this.emit(scope, 'appointment.updated', {
        appointmentId: id,
        doctorId: updated.doctorId,
      });
    }
    return toDetail(updated);
  }

  /**
   * Change the type of a SCHEDULED or CONFIRMED future appointment. The end time follows the
   * new type's duration unless `keepDuration`; the change goes through `update`, so the
   * SERIALIZABLE booking transaction, overlap check and working hours all apply.
   */
  async changeType(id: string, dto: ChangeAppointmentTypeDto): Promise<AppointmentDetail> {
    const scope = this.tenant.get();
    const existing = await this.loadDetail(scope.clinicId, id);
    if (existing.status !== 'SCHEDULED' && existing.status !== 'CONFIRMED') {
      throw illegalTransition(existing.status, existing.status);
    }
    if (existing.startsAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Only future appointments can change type',
        details: { field: 'startsAt' },
      });
    }
    const typeDef = await this.types.requireActive(scope.clinicId, dto.type);
    return this.update(
      id,
      {
        type: dto.type,
        ...(dto.keepDuration ? {} : { durationMinutes: typeDef.durationMinutes }),
      },
      { typeChange: true },
    );
  }

  /** Adds `typeName` (request language) and `typeColor` to appointment DTOs. */
  async withTypeInfo<T extends AppointmentListItem>(items: T[], locale?: string): Promise<T[]>;
  async withTypeInfo<T extends AppointmentListItem>(item: T, locale?: string): Promise<T>;
  async withTypeInfo<T extends AppointmentListItem>(
    input: T | T[],
    locale?: string,
  ): Promise<T | T[]> {
    const list = Array.isArray(input) ? input : [input];
    if (list.length === 0) return list;
    const map = await this.types.byCode(this.tenant.get().clinicId, locale);
    const out = list.map((a) => {
      const t = map.get(a.type);
      return { ...a, typeName: t?.displayName ?? a.type, typeColor: t?.color ?? 'primary' };
    });
    return Array.isArray(input) ? out : out[0]!;
  }

  // ------------------------------------------------------------------ status / cancel

  private async assertCanChangeStatus(scope: TenantScope, doctorId: string): Promise<void> {
    if (scope.role !== 'DOCTOR') return;
    const own = await this.doctors.ownDoctorId(scope);
    if (!own || own !== doctorId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Doctors can only change their own appointments',
      });
    }
  }

  async changeStatus(id: string, to: AppointmentStatus): Promise<AppointmentDetail> {
    const scope = this.tenant.get();
    if (to === 'CANCELLED') {
      throw validation('Use the cancel endpoint to cancel an appointment', { status: to });
    }
    const existing = await this.loadDetail(scope.clinicId, id);
    await this.assertCanChangeStatus(scope, existing.doctorId);
    assertTransition(existing.status, to);
    const updated = await this.prisma.$transactionWith(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id, clinicId: scope.clinicId, status: existing.status },
        data: { status: to },
      });
      if (result.count === 0) throw illegalTransition(existing.status, to);
      await this.audit.record(tx, {
        actorUserId: auditActor(scope),
        action: 'update',
        entity: 'appointment',
        entityId: id,
        before: { status: existing.status },
        after: { status: to },
      });
      return tx.appointment.findFirstOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    });
    await this.emit(scope, 'appointment.status_changed', {
      appointmentId: id,
      from: existing.status,
      to,
    });
    return toDetail(updated);
  }

  async cancel(id: string, reason?: string): Promise<AppointmentDetail> {
    const scope = this.tenant.get();
    const settings = await this.settings.get(scope.clinicId);
    const existing = await this.loadDetail(scope.clinicId, id);
    const trimmed = reason?.trim();
    if (settings.requireCancelReason && !trimmed) {
      throw new BadRequestException({
        code: 'CANCEL_REASON_REQUIRED',
        message: 'A cancellation reason is required',
      });
    }
    assertTransition(existing.status, 'CANCELLED');
    const noticeMs = settings.cancellationNoticeHours * 3600_000;
    if (scope.role === 'RECEPTIONIST' && existing.startsAt.getTime() - Date.now() < noticeMs) {
      throw new ConflictException({
        code: 'CANCELLATION_POLICY',
        message: 'Late cancellations need an administrator',
        details: { noticeHours: settings.cancellationNoticeHours },
      });
    }
    const updated = await this.prisma.$transactionWith(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id, clinicId: scope.clinicId, status: existing.status },
        data: { status: 'CANCELLED', cancelReason: trimmed ?? null },
      });
      if (result.count === 0) throw illegalTransition(existing.status, 'CANCELLED');
      await tx.reminderDelivery.updateMany({
        where: { appointmentId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await this.audit.record(tx, {
        actorUserId: auditActor(scope),
        action: 'update',
        entity: 'appointment',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'CANCELLED', cancelReason: trimmed ?? null },
      });
      return tx.appointment.findFirstOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    });
    await this.emit(scope, 'appointment.cancelled', {
      appointmentId: id,
      reason: trimmed ?? null,
      doctorId: existing.doctorId,
      startsAt: existing.startsAt.toISOString(),
    });
    return toDetail(updated);
  }

  async bulk(dto: BulkActionDto): Promise<BulkActionResult> {
    const result: BulkActionResult = { updated: 0, failed: [] };
    for (const id of dto.ids) {
      try {
        if (dto.action === 'CONFIRM') await this.changeStatus(id, 'CONFIRMED');
        else await this.cancel(id, dto.reason);
        result.updated += 1;
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        result.failed.push({ id, code: errorCode(error) });
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ locks / reminders

  async lock(dto: CreateLockDto): Promise<SlotLock> {
    const scope = this.tenant.get();
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, clinicId: scope.clinicId },
      select: { id: true },
    });
    if (!doctor) throw notFound('Doctor not found');
    const startsAt = parseInstant(dto.startsAt, 'startsAt');
    const acquired = await this.locks.acquire(
      doctor.id,
      startsAt,
      dto.durationMinutes,
      scope.userId,
    );
    if (!acquired.ok) throw this.lockedError();
    return { lockToken: acquired.lock.token, expiresAt: acquired.lock.expiresAt };
  }

  async unlock(token: string): Promise<{ success: true }> {
    await this.locks.release(token);
    return { success: true };
  }

  async retryReminder(deliveryId: string): Promise<ReminderDto> {
    const { clinicId } = this.tenant.get();
    const delivery = await this.prisma.reminderDelivery.findFirst({
      where: { id: deliveryId, appointment: { clinicId } },
    });
    if (!delivery) throw notFound('Reminder not found');
    if (delivery.status !== 'FAILED') {
      throw new ConflictException({
        code: 'ILLEGAL_TRANSITION',
        message: 'Only failed reminders can be retried',
        details: { from: delivery.status, to: 'PENDING', allowed: [] },
      });
    }
    const updated = await this.prisma.reminderDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', error: null },
    });
    return toReminderDto(updated);
  }
}
