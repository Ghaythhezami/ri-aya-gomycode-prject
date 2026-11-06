import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DoctorCard, DoctorDetail, HoursConflict, LeaveDto, SlotDto } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../events/domain-events.service';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { ClinicReferenceService, toRoomDto } from '../clinic/clinic-reference.service';
import { SlotLockService } from '../appointments/slot-lock.service';
import { APPOINTMENT_LIST_INCLUDE, toAppointmentListItem } from '../common/mappers';
import {
  dayRuleIntervals,
  generateSlots,
  isWithinAvailability,
  type TimeRange,
  type WorkingRule,
} from '../core/availability';
import { addDays, localDayBounds, todayIn } from '../core/clinic-time';
import { availableForDates, dateRange } from './availability-window';
import { buildDoctorCard, toWorkingIntervals, type DoctorCardSource } from './doctor-card';
import {
  CreateDoctorDto,
  CreateLeaveDto,
  ListDoctorsQueryDto,
  PutWorkingHoursDto,
  SlotsQueryDto,
  UpdateDoctorDto,
  WorkingIntervalDto,
} from './dto/doctor.dto';

const FREED = ['CANCELLED', 'NO_SHOW'] as ('CANCELLED' | 'NO_SHOW')[];
const DAY_MS = 24 * 3600_000;
const CONFLICT_HORIZON_DAYS = 60;

function validation(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message, details });
}

function notFound(message = 'Doctor not found'): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

export function validateIntervals(intervals: WorkingIntervalDto[]): void {
  for (const i of intervals) {
    if (i.endMinute === i.startMinute) {
      throw validation('Interval start and end must differ', { interval: i });
    }
    if (i.endMinute > 1440 || i.startMinute < 0) {
      throw validation('Interval out of range', { interval: i });
    }
  }
}

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly settings: ClinicSettingsReader,
    private readonly reference: ClinicReferenceService,
    private readonly locks: SlotLockService,
  ) {}

  // ------------------------------------------------------------------ helpers

  /** The doctor profile linked to the signed-in DOCTOR user, if any. */
  async ownDoctorId(scope: TenantScope): Promise<string | null> {
    if (scope.role !== 'DOCTOR') return null;
    const doctor = await this.prisma.doctor.findFirst({
      where: { clinicId: scope.clinicId, userId: scope.userId },
      select: { id: true },
    });
    return doctor?.id ?? null;
  }

  private async assertCanEditSchedule(
    scope: TenantScope,
    doctor: { id: string; userId: string | null },
  ) {
    if (scope.role === 'DOCTOR' && doctor.userId !== scope.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Doctors can only edit their own schedule',
      });
    }
  }

  private async loadDoctor(clinicId: string, id: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, clinicId },
      include: { room: true, workingHours: true },
    });
    if (!doctor) throw notFound();
    return doctor;
  }

  private emitAvailability(scope: TenantScope, doctorId: string) {
    return this.events.emit({
      type: 'doctor.availability_changed',
      clinicId: scope.clinicId,
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      payload: { doctorId },
    });
  }

  private async resolveDate(date: string | undefined, timeZone: string): Promise<string> {
    if (!date) return todayIn(timeZone);
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw validation('Invalid date', { date });
    return date;
  }

  // ------------------------------------------------------------------ cards

  private async cardSources(
    clinicId: string,
    date: string,
    timeZone: string,
    where: Prisma.DoctorWhereInput,
  ) {
    const { start, end } = localDayBounds(date, timeZone);
    const doctors = await this.prisma.doctor.findMany({
      where: { clinicId, ...where },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        room: true,
        workingHours: true,
        leaves: {
          where: { endsAt: { gt: new Date(start.getTime() - DAY_MS) }, startsAt: { lt: end } },
        },
      },
    });
    const appointments = doctors.length
      ? await this.prisma.appointment.findMany({
          where: {
            clinicId,
            doctorId: { in: doctors.map((d) => d.id) },
            startsAt: { lt: end },
            endsAt: { gt: start },
            status: { notIn: FREED },
          },
          select: { doctorId: true, startsAt: true, endsAt: true, status: true },
        })
      : [];
    return { doctors, appointments };
  }

  private cardOf(
    doctor: Awaited<ReturnType<DoctorsService['cardSources']>>['doctors'][number],
    appointments: { doctorId: string; startsAt: Date; endsAt: Date; status: string }[],
    date: string,
    timeZone: string,
  ): DoctorCard {
    const source: DoctorCardSource = {
      ...doctor,
      room: doctor.room ? toRoomDto(doctor.room) : null,
    };
    return buildDoctorCard({
      doctor: source,
      date,
      timeZone,
      now: new Date(),
      appointments: appointments.filter((a) => a.doctorId === doctor.id),
    });
  }

  async list(query: ListDoctorsQueryDto): Promise<DoctorCard[]> {
    const { clinicId } = this.tenant.get();
    const { clinic } = await this.settings.get(clinicId);
    const date = await this.resolveDate(query.date, clinic.timezone);
    const search = query.search?.trim();
    const where: Prisma.DoctorWhereInput = {
      ...(query.specialty
        ? { specialty: { equals: query.specialty.trim(), mode: 'insensitive' } }
        : {}),
      ...(search
        ? {
            OR: search
              .split(/\s+/)
              .flatMap((term) => [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { specialty: { contains: term, mode: 'insensitive' as const } },
              ]),
          }
        : {}),
    };
    const { doctors, appointments } = await this.cardSources(
      clinicId,
      date,
      clinic.timezone,
      where,
    );
    return doctors.map((d) => this.cardOf(d, appointments, date, clinic.timezone));
  }

  private async detailOf(clinicId: string, id: string, dateInput?: string): Promise<DoctorDetail> {
    const { clinic } = await this.settings.get(clinicId);
    const date = await this.resolveDate(dateInput, clinic.timezone);
    const { doctors, appointments } = await this.cardSources(clinicId, date, clinic.timezone, {
      id,
    });
    const doctor = doctors[0];
    if (!doctor) throw notFound();
    const [leaves, upcoming] = await Promise.all([
      this.prisma.doctorLeave.findMany({
        where: { doctorId: id, endsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: { clinicId, doctorId: id, startsAt: { gte: new Date() }, status: { notIn: FREED } },
        include: APPOINTMENT_LIST_INCLUDE,
        orderBy: { startsAt: 'asc' },
        take: 10,
      }),
    ]);
    return {
      ...this.cardOf(doctor, appointments, date, clinic.timezone),
      licenseNumber: doctor.licenseNumber,
      workingHours: toWorkingIntervals(doctor.workingHours),
      leaves: leaves.map(toLeaveDto),
      upcoming: upcoming.map(toAppointmentListItem),
    };
  }

  get(id: string, date?: string): Promise<DoctorDetail> {
    return this.detailOf(this.tenant.get().clinicId, id, date);
  }

  // ------------------------------------------------------------------ CRUD

  private async assertRoom(clinicId: string, roomId: string | null | undefined) {
    if (!roomId) return;
    const room = await this.prisma.room.findFirst({ where: { id: roomId, clinicId } });
    if (!room) throw notFound('Room not found');
  }

  private snapshot(d: {
    firstName: string;
    lastName: string;
    specialty: string;
    consultationMinutes: number;
    licenseNumber: string | null;
    roomId: string | null;
    isActive: boolean;
  }) {
    return {
      firstName: d.firstName,
      lastName: d.lastName,
      specialty: d.specialty,
      consultationMinutes: d.consultationMinutes,
      licenseNumber: d.licenseNumber,
      roomId: d.roomId,
      isActive: d.isActive,
    };
  }

  async create(dto: CreateDoctorDto): Promise<DoctorDetail> {
    const scope = this.tenant.get();
    await this.assertRoom(scope.clinicId, dto.roomId);
    const created = await this.prisma.$transactionWith(async (tx) => {
      const row = await tx.doctor.create({
        data: {
          clinicId: scope.clinicId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          specialty: dto.specialty.trim(),
          consultationMinutes: dto.consultationMinutes ?? 30,
          licenseNumber: dto.licenseNumber ?? null,
          roomId: dto.roomId ?? null,
        },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'create',
        entity: 'doctor',
        entityId: row.id,
        after: this.snapshot(row),
      });
      return row;
    });
    await this.reference.invalidate(scope.clinicId);
    await this.emitAvailability(scope, created.id);
    return this.detailOf(scope.clinicId, created.id);
  }

  async update(id: string, dto: UpdateDoctorDto): Promise<DoctorDetail> {
    const scope = this.tenant.get();
    const before = await this.loadDoctor(scope.clinicId, id);
    if (dto.roomId !== undefined) await this.assertRoom(scope.clinicId, dto.roomId);
    const data: Prisma.DoctorUncheckedUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.specialty !== undefined) data.specialty = dto.specialty.trim();
    if (dto.consultationMinutes !== undefined) data.consultationMinutes = dto.consultationMinutes;
    if (dto.licenseNumber !== undefined) data.licenseNumber = dto.licenseNumber;
    if (dto.roomId !== undefined) data.roomId = dto.roomId;
    await this.prisma.$transactionWith(async (tx) => {
      const row = await tx.doctor.update({ where: { id }, data });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'doctor',
        entityId: id,
        before: this.snapshot(before),
        after: this.snapshot(row),
      });
    });
    await this.reference.invalidate(scope.clinicId);
    return this.detailOf(scope.clinicId, id);
  }

  async deactivate(id: string): Promise<{ flagged: number }> {
    const scope = this.tenant.get();
    const before = await this.loadDoctor(scope.clinicId, id);
    const flagged = await this.prisma.$transactionWith(async (tx) => {
      await tx.doctor.update({ where: { id }, data: { isActive: false } });
      const result = await tx.appointment.updateMany({
        where: {
          clinicId: scope.clinicId,
          doctorId: id,
          startsAt: { gte: new Date() },
          status: { notIn: [...FREED, 'COMPLETED'] },
        },
        data: { needsReschedule: true },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'doctor',
        entityId: id,
        before: this.snapshot(before),
        after: { ...this.snapshot(before), isActive: false, flaggedAppointments: result.count },
      });
      return result.count;
    });
    await this.reference.invalidate(scope.clinicId);
    await this.emitAvailability(scope, id);
    return { flagged };
  }

  async activate(id: string): Promise<DoctorDetail> {
    const scope = this.tenant.get();
    const before = await this.loadDoctor(scope.clinicId, id);
    await this.prisma.$transactionWith(async (tx) => {
      await tx.doctor.update({ where: { id }, data: { isActive: true } });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'doctor',
        entityId: id,
        before: this.snapshot(before),
        after: { ...this.snapshot(before), isActive: true },
      });
    });
    await this.reference.invalidate(scope.clinicId);
    await this.emitAvailability(scope, id);
    return this.detailOf(scope.clinicId, id);
  }

  // ------------------------------------------------------------------ working hours

  async putWorkingHours(id: string, dto: PutWorkingHoursDto): Promise<DoctorDetail> {
    const scope = this.tenant.get();
    const doctor = await this.loadDoctor(scope.clinicId, id);
    await this.assertCanEditSchedule(scope, doctor);
    validateIntervals(dto.intervals);
    const { clinic } = await this.settings.get(scope.clinicId);

    const rules: WorkingRule[] = dto.intervals.map((i) => ({
      weekday: i.weekday,
      startMinute: i.startMinute,
      endMinute: i.endMinute,
      kind: i.kind,
    }));
    const conflicts = await this.findHoursConflicts(scope.clinicId, id, rules, clinic.timezone);
    if (conflicts.length && !dto.confirm) {
      throw new ConflictException({
        code: 'HOURS_CONFLICT',
        message: 'The new hours conflict with existing appointments',
        details: { conflicts: conflicts.map((c) => c.conflict) },
      });
    }

    await this.prisma.$transactionWith(async (tx) => {
      await tx.workingHour.deleteMany({ where: { doctorId: id } });
      if (rules.length) {
        await tx.workingHour.createMany({ data: rules.map((r) => ({ ...r, doctorId: id })) });
      }
      if (conflicts.length) {
        await tx.appointment.updateMany({
          where: {
            clinicId: scope.clinicId,
            id: { in: conflicts.map((c) => c.conflict.appointmentId) },
          },
          data: { needsReschedule: true },
        });
      }
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'doctor',
        entityId: id,
        before: { workingHours: toWorkingIntervals(doctor.workingHours) },
        after: {
          workingHours: toWorkingIntervals(rules),
          flaggedAppointments: conflicts.length,
        },
      });
    });
    await this.emitAvailability(scope, id);
    return this.detailOf(scope.clinicId, id);
  }

  /** Future (60 days) non-cancelled appointments that fall outside `rules`. */
  async findHoursConflicts(
    clinicId: string,
    doctorId: string,
    rules: WorkingRule[],
    timeZone: string,
  ): Promise<{ conflict: HoursConflict }[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + CONFLICT_HORIZON_DAYS * DAY_MS);
    const [appointments, leaves] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          clinicId,
          doctorId,
          startsAt: { gte: now, lt: horizon },
          status: { notIn: FREED },
          type: { not: 'EMERGENCY' },
        },
        include: { patient: { select: { firstName: true, lastName: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.doctorLeave.findMany({
        where: { doctorId, endsAt: { gt: now }, startsAt: { lt: horizon } },
      }),
    ]);
    if (appointments.length === 0) return [];
    const dates = dateRange(addDays(todayIn(timeZone, now), -1), CONFLICT_HORIZON_DAYS + 3);
    const available = availableForDates(dates, timeZone, rules, leaves);
    return appointments
      .filter((a) => !isWithinAvailability(a, available))
      .map((a) => ({
        conflict: {
          appointmentId: a.id,
          code: a.code,
          patientName: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
          startsAt: a.startsAt.toISOString(),
        },
      }));
  }

  // ------------------------------------------------------------------ leaves

  async addLeave(id: string, dto: CreateLeaveDto): Promise<LeaveDto> {
    const scope = this.tenant.get();
    const doctor = await this.loadDoctor(scope.clinicId, id);
    await this.assertCanEditSchedule(scope, doctor);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw validation('Leave must end after it starts');
    const leave = await this.prisma.$transactionWith(async (tx) => {
      const row = await tx.doctorLeave.create({
        data: { doctorId: id, startsAt, endsAt, reason: dto.reason ?? null },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'create',
        entity: 'doctor_leave',
        entityId: row.id,
        after: { doctorId: id, ...toLeaveDto(row) },
      });
      return row;
    });
    await this.emitAvailability(scope, id);
    return toLeaveDto(leave);
  }

  async removeLeave(id: string, leaveId: string): Promise<{ success: true }> {
    const scope = this.tenant.get();
    const doctor = await this.loadDoctor(scope.clinicId, id);
    await this.assertCanEditSchedule(scope, doctor);
    const leave = await this.prisma.doctorLeave.findFirst({ where: { id: leaveId, doctorId: id } });
    if (!leave) throw notFound('Leave not found');
    await this.prisma.$transactionWith(async (tx) => {
      await tx.doctorLeave.delete({ where: { id: leaveId } });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'delete',
        entity: 'doctor_leave',
        entityId: leaveId,
        before: { doctorId: id, ...toLeaveDto(leave) },
      });
    });
    await this.emitAvailability(scope, id);
    return { success: true };
  }

  // ------------------------------------------------------------------ slots

  async slots(id: string, query: SlotsQueryDto): Promise<SlotDto[]> {
    const scope = this.tenant.get();
    const doctor = await this.loadDoctor(scope.clinicId, id);
    const settings = await this.settings.get(scope.clinicId);
    const timeZone = settings.clinic.timezone;
    const date = await this.resolveDate(query.date, timeZone);
    if (!doctor.isActive) return [];
    const durationMinutes = query.durationMinutes ?? doctor.consultationMinutes;
    const { start, end } = localDayBounds(date, timeZone);
    // Night shifts reach into the next local day.
    const windowEnd = new Date(end.getTime() + DAY_MS);
    const [appointments, leaves] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          clinicId: scope.clinicId,
          doctorId: id,
          startsAt: { lt: windowEnd },
          endsAt: { gt: start },
          status: { notIn: FREED },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.doctorLeave.findMany({
        where: { doctorId: id, endsAt: { gt: start }, startsAt: { lt: windowEnd } },
      }),
    ]);

    const workRules = doctor.workingHours.filter((r) => r.kind !== 'BREAK');
    const { breaks } = dayRuleIntervals(date, timeZone, doctor.workingHours);
    const breakRanges: TimeRange[] = breaks.map((b) => ({
      startsAt: new Date(b.start),
      endsAt: new Date(b.end),
    }));
    const base = {
      date,
      timeZone,
      rules: workRules,
      durationMinutes,
      stepMinutes: settings.slotMinutes,
    };
    const grid = generateSlots(base);
    const lockRanges = await this.locks.othersLocked(
      id,
      grid.map((s) => s.startsAt),
      scope.userId,
    );
    const slots = generateSlots({
      ...base,
      busy: [...appointments, ...leaves, ...breakRanges, ...lockRanges],
      now: new Date(),
    });
    return slots.map((s) => ({
      doctorId: id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      available: s.available,
      period: s.period,
    }));
  }
}

function toLeaveDto(leave: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}): LeaveDto {
  return {
    id: leave.id,
    startsAt: leave.startsAt.toISOString(),
    endsAt: leave.endsAt.toISOString(),
    reason: leave.reason,
  };
}
