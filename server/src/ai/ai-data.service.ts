import { Injectable } from '@nestjs/common';
import { normalizeLocalized, pickLocalized } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { dayRuleIntervals, generateSlots, type TimeRange } from '../core/availability';
import { addDays, localDayBounds, toLocalDate } from '../core/clinic-time';
import { doctorName } from '../common/mappers';
import { toLocalIso } from './ai-format';

const DAY_MS = 24 * 3600_000;
const FREED = ['CANCELLED', 'NO_SHOW'] as ('CANCELLED' | 'NO_SHOW')[];
const MAX_SLOTS = 40;
const MAX_SLOTS_PER_DOCTOR_DAY = 6;
const MAX_DOCTORS = 6;

export interface SlotView {
  doctorId: string;
  doctorName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface BookableType {
  code: string;
  name: string;
  durationMinutes: number;
  isEmergency: boolean;
}

interface DoctorForSlots {
  id: string;
  firstName: string;
  lastName: string;
  firstNameI18n: unknown;
  lastNameI18n: unknown;
  specialty: string;
  consultationMinutes: number;
  workingHours: { weekday: number; startMinute: number; endMinute: number; kind: string }[];
}

/**
 * Clinic-scoped reads shared by the assistant tools. Every method takes the `clinicId` of the
 * verified caller and filters by it; nothing here reads a tenant from model input.
 */
@Injectable()
export class AiDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ClinicSettingsReader,
  ) {}

  /** Active appointment types a patient or desk can book, with localized names. */
  async appointmentTypes(clinicId: string, locale: string): Promise<BookableType[]> {
    const rows = await this.prisma.appointmentTypeDef.findMany({
      where: { clinicId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      code: r.code,
      name: pickLocalized(normalizeLocalized(r.name), locale, r.code),
      durationMinutes: r.durationMinutes,
      isEmergency: r.isEmergency,
    }));
  }

  private async doctorsFor(
    clinicId: string,
    filter: { doctorId?: string; specialty?: string },
  ): Promise<DoctorForSlots[]> {
    return this.prisma.doctor.findMany({
      where: {
        clinicId,
        isActive: true,
        ...(filter.doctorId ? { id: filter.doctorId } : {}),
        ...(filter.specialty
          ? { specialty: { equals: filter.specialty.trim(), mode: 'insensitive' as const } }
          : {}),
      },
      include: { workingHours: true },
      orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
      take: MAX_DOCTORS,
    });
  }

  private daySlots(
    doctor: DoctorForSlots,
    date: string,
    timeZone: string,
    durationMinutes: number,
    stepMinutes: number,
    busy: TimeRange[],
    now: Date,
  ): SlotView[] {
    const work = doctor.workingHours.filter((r) => r.kind !== 'BREAK');
    const { breaks } = dayRuleIntervals(date, timeZone, doctor.workingHours);
    const breakRanges: TimeRange[] = breaks.map((b) => ({
      startsAt: new Date(b.start),
      endsAt: new Date(b.end),
    }));
    return generateSlots({
      date,
      timeZone,
      rules: work,
      durationMinutes,
      stepMinutes,
      busy: [...busy, ...breakRanges],
      now,
    })
      .filter((s) => s.available)
      .map((s) => ({
        doctorId: doctor.id,
        doctorName: doctorName(doctor),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      }));
  }

  private async busyRanges(
    clinicId: string,
    doctorIds: string[],
    from: Date,
    to: Date,
    ignoreAppointmentId?: string,
  ): Promise<Map<string, TimeRange[]>> {
    const [appointments, leaves] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          clinicId,
          doctorId: { in: doctorIds },
          startsAt: { lt: to },
          endsAt: { gt: from },
          status: { notIn: FREED },
          ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
        },
        select: { doctorId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.doctorLeave.findMany({
        where: { doctorId: { in: doctorIds }, endsAt: { gt: from }, startsAt: { lt: to } },
        select: { doctorId: true, startsAt: true, endsAt: true },
      }),
    ]);
    const map = new Map<string, TimeRange[]>(doctorIds.map((id) => [id, []]));
    for (const r of [...appointments, ...leaves]) {
      map.get(r.doctorId)?.push({ startsAt: r.startsAt, endsAt: r.endsAt });
    }
    return map;
  }

  /** Free slots over `days` local days from `fromDate`, capped for the model's context. */
  async findSlots(
    clinicId: string,
    p: {
      doctorId?: string;
      specialty?: string;
      fromDate: string;
      days: number;
      durationMinutes?: number;
      now: Date;
    },
  ): Promise<{ timezone: string; slots: SlotView[] }> {
    const settings = await this.settings.get(clinicId);
    const timeZone = settings.clinic.timezone;
    const doctors = await this.doctorsFor(clinicId, p);
    if (!doctors.length) return { timezone: timeZone, slots: [] };
    const days = Math.min(Math.max(p.days, 1), 14);
    const from = localDayBounds(p.fromDate, timeZone).start;
    const lastDay = localDayBounds(addDays(p.fromDate, days - 1), timeZone).end;
    const busy = await this.busyRanges(
      clinicId,
      doctors.map((d) => d.id),
      new Date(from.getTime() - DAY_MS),
      new Date(lastDay.getTime() + DAY_MS),
    );
    const slots: SlotView[] = [];
    for (let i = 0; i < days && slots.length < MAX_SLOTS; i++) {
      const date = addDays(p.fromDate, i);
      for (const doctor of doctors) {
        const found = this.daySlots(
          doctor,
          date,
          timeZone,
          p.durationMinutes ?? doctor.consultationMinutes,
          settings.slotMinutes,
          busy.get(doctor.id) ?? [],
          p.now,
        );
        slots.push(...found.slice(0, MAX_SLOTS_PER_DOCTOR_DAY));
      }
    }
    return { timezone: timeZone, slots: slots.slice(0, MAX_SLOTS) };
  }

  /**
   * Feasibility of a proposal: the doctor is active and `startsAt` is a free slot of the doctor's
   * grid for the duration. The appointment being moved (reschedule) does not block itself.
   */
  async isSlotFree(
    clinicId: string,
    p: {
      doctorId: string;
      startsAt: Date;
      durationMinutes: number;
      now: Date;
      ignoreAppointmentId?: string;
    },
  ): Promise<{ free: boolean; doctorName: string | null }> {
    const settings = await this.settings.get(clinicId);
    const timeZone = settings.clinic.timezone;
    const [doctor] = await this.doctorsFor(clinicId, { doctorId: p.doctorId });
    if (!doctor) return { free: false, doctorName: null };
    const date = toLocalDate(p.startsAt, timeZone);
    const { start, end } = localDayBounds(date, timeZone);
    const busy = await this.busyRanges(
      clinicId,
      [doctor.id],
      new Date(start.getTime() - DAY_MS),
      new Date(end.getTime() + DAY_MS),
      p.ignoreAppointmentId,
    );
    const slots = this.daySlots(
      doctor,
      date,
      timeZone,
      p.durationMinutes,
      settings.slotMinutes,
      busy.get(doctor.id) ?? [],
      p.now,
    );
    return {
      free: slots.some((s) => s.startsAt.getTime() === p.startsAt.getTime()),
      doctorName: doctorName(doctor),
    };
  }

  slotToJson(slot: SlotView, timeZone: string) {
    return {
      doctorId: slot.doctorId,
      doctor: slot.doctorName,
      startsAt: toLocalIso(slot.startsAt, timeZone),
      endsAt: toLocalIso(slot.endsAt, timeZone),
    };
  }
}
