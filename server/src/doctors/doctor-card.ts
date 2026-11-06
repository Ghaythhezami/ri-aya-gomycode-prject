import type { DoctorAvailability, DoctorCard, RoomDto, WorkingInterval } from '@riaya/shared';
import {
  dayRuleIntervals,
  subtractIntervals,
  toInterval,
  type TimeRange,
  type WorkingRule,
} from '../core/availability';
import { formatMinuteOfDay, todayIn, weekdayOf } from '../core/clinic-time';
import { doctorName, initials } from '../common/mappers';
import { computeUtilisation } from './utilisation';

export interface DoctorCardSource {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  consultationMinutes: number;
  isActive: boolean;
  room: RoomDto | null;
  workingHours: { weekday: number; startMinute: number; endMinute: number; kind: string }[];
  leaves: TimeRange[];
}

export interface CardAppointment {
  startsAt: Date;
  endsAt: Date;
  status: string;
}

export function toWorkingIntervals(rules: WorkingRule[]): WorkingInterval[] {
  return rules
    .map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      kind: (r.kind === 'BREAK' ? 'BREAK' : 'WORK') as WorkingInterval['kind'],
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

export function buildDoctorCard(input: {
  doctor: DoctorCardSource;
  date: string;
  timeZone: string;
  now: Date;
  appointments: CardAppointment[];
}): DoctorCard {
  const { doctor, date, timeZone, now, appointments } = input;
  const { work, breaks } = dayRuleIntervals(date, timeZone, doctor.workingHours);
  const leaveIntervals = doctor.leaves.map(toInterval);
  const available = subtractIntervals(work, [...breaks, ...leaveIntervals]);
  const isToday = date === todayIn(timeZone, now);
  const nowMs = now.getTime();

  let availability: DoctorAvailability;
  if (!doctor.isActive) {
    availability = 'INACTIVE';
  } else if (
    isToday
      ? leaveIntervals.some((l) => nowMs >= l.start && nowMs < l.end)
      : work.length > 0 && subtractIntervals(work, leaveIntervals).length === 0
  ) {
    availability = 'ON_LEAVE';
  } else if (
    work.length === 0 ||
    (isToday && !work.some((w) => nowMs >= w.start && nowMs < w.end))
  ) {
    // No shift that day, or (today) outside every working interval: before or after hours.
    availability = 'OFF_DUTY';
  } else if (isToday && appointments.some((a) => a.status === 'IN_PROGRESS')) {
    availability = 'IN_CONSULTATION';
  } else if (isToday && breaks.some((b) => nowMs >= b.start && nowMs < b.end)) {
    availability = 'ON_BREAK';
  } else {
    availability = 'AVAILABLE';
  }

  const weekday = weekdayOf(date);
  const dayWork = doctor.workingHours.filter((r) => r.weekday === weekday && r.kind !== 'BREAK');
  const hoursLabel = dayWork.length
    ? `${formatMinuteOfDay(Math.min(...dayWork.map((r) => r.startMinute)))}–${formatMinuteOfDay(
        Math.max(...dayWork.map((r) => r.endMinute)),
      )}`
    : null;

  return {
    id: doctor.id,
    name: doctorName(doctor),
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    initials: initials(doctor.firstName, doctor.lastName),
    specialty: doctor.specialty,
    consultationMinutes: doctor.consultationMinutes,
    isActive: doctor.isActive,
    availability,
    hoursLabel,
    appointmentsCount: appointments.length,
    utilisation: computeUtilisation(available, appointments.map(toInterval)).utilisation,
    room: doctor.room,
  };
}
