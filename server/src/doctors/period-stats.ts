import { UnprocessableEntityException } from '@nestjs/common';
import type { DoctorDailyStats, DoctorPeriodStats } from '@riaya/shared';
import {
  availableIntervals,
  toInterval,
  type TimeRange,
  type WorkingRule,
} from '../core/availability';
import { toLocalDate } from '../core/clinic-time';

import { dateRange } from './availability-window';
import { computeUtilisation } from './utilisation';

export const MAX_PERIOD_DAYS = 92;
const DAY_MS = 24 * 3600_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodAppointment {
  startsAt: Date;
  endsAt: Date;
  status: string;
}

function invalid(message: string, details?: unknown): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message, details });
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * `from`/`to` (inclusive local dates). One bound alone is used for both ends.
 * Returns null when neither is given. Throws 422 for a bad range or more than 92 days.
 */
export function resolvePeriod(
  from?: string,
  to?: string,
): { from: string; to: string; days: number } | null {
  if (!from && !to) return null;
  const start = from ?? to!;
  const end = to ?? from!;
  for (const d of [start, end]) {
    if (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      throw invalid('Invalid date', { date: d });
    }
  }
  const days = dayNumber(end) - dayNumber(start) + 1;
  if (days < 1) throw invalid('"to" must not be before "from"', { from: start, to: end });
  if (days > MAX_PERIOD_DAYS) {
    throw invalid(`The period is limited to ${MAX_PERIOD_DAYS} days`, {
      from: start,
      to: end,
      maxDays: MAX_PERIOD_DAYS,
    });
  }
  return { from: start, to: end, days };
}

/**
 * Appointments, booked/available minutes and utilisation of one doctor over a date range.
 * Available time is working hours minus breaks and leaves, per local day in the clinic time zone.
 * `appointmentsCount` excludes cancelled and no-show bookings (like the day card);
 * `completedCount` and `noShowCount` are reported separately.
 */
export function computePeriodStats(input: {
  from: string;
  to: string;
  timeZone: string;
  rules: WorkingRule[];
  leaves: TimeRange[];
  appointments: PeriodAppointment[];
}): { period: DoctorPeriodStats; daily: DoctorDailyStats[] } {
  const { from, to, timeZone, rules, leaves } = input;
  const days = dayNumber(to) - dayNumber(from) + 1;
  const live = input.appointments.filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');
  const perDay = new Map<string, PeriodAppointment[]>();
  for (const a of live) {
    const key = toLocalDate(a.startsAt, timeZone);
    const list = perDay.get(key);
    if (list) list.push(a);
    else perDay.set(key, [a]);
  }

  let booked = 0;
  let available = 0;
  let busiest: string | null = null;
  let busiestCount = 0;
  const daily: DoctorDailyStats[] = dateRange(from, days).map((date) => {
    const apps = perDay.get(date) ?? [];
    const u = computeUtilisation(
      availableIntervals(date, timeZone, rules, leaves),
      apps.map(toInterval),
    );
    booked += u.bookedMinutes;
    available += u.availableMinutes;
    if (apps.length > busiestCount) {
      busiestCount = apps.length;
      busiest = date;
    }
    return { date, appointments: apps.length, utilisation: u.utilisation };
  });

  return {
    period: {
      from,
      to,
      appointmentsCount: live.length,
      completedCount: input.appointments.filter((a) => a.status === 'COMPLETED').length,
      noShowCount: input.appointments.filter((a) => a.status === 'NO_SHOW').length,
      bookedMinutes: booked,
      availableMinutes: available,
      utilisation: available > 0 ? Math.min(100, Math.round((100 * booked) / available)) : 0,
      busiestDay: busiest,
    },
    daily,
  };
}
