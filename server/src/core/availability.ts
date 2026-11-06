/**
 * Availability and slot generation (DOC-2). Pure functions, no I/O, so the 15+
 * edge cases (midnight, daylight saving, breaks, leave) are unit-tested directly.
 *
 * Model: a doctor's WORK intervals for the weekday, minus BREAK intervals for the
 * weekday, minus leave periods, give the available intervals. Slots are cut from
 * available intervals only, so no slot can ever fall in a break, a leave or
 * outside working hours — by construction rather than by a later filter.
 */
import type { DayPeriod } from '@riaya/shared';
import { addDays, localMinuteOfDay, localToUtc, weekdayOf } from './clinic-time';

const MINUTE = 60_000;

/** Half-open [start, end) in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

export interface WorkingRule {
  weekday: number;
  startMinute: number;
  endMinute: number;
  kind: string; // 'WORK' | 'BREAK'
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  period: DayPeriod;
}

/** Sort and merge overlapping or touching intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const current of sorted) {
    const last = out[out.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      out.push({ ...current });
    }
  }
  return out;
}

/** `base` minus every interval in `cuts`. */
export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const cut of mergeIntervals(cuts)) {
    const next: Interval[] = [];
    for (const interval of result) {
      if (cut.end <= interval.start || cut.start >= interval.end) {
        next.push(interval);
        continue;
      }
      if (cut.start > interval.start) next.push({ start: interval.start, end: cut.start });
      if (cut.end < interval.end) next.push({ start: cut.end, end: interval.end });
    }
    result = next;
  }
  return result;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function totalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start) / MINUTE, 0);
}

export function toInterval(range: TimeRange): Interval {
  return { start: range.startsAt.getTime(), end: range.endsAt.getTime() };
}

/**
 * Rule → instants on a local date. `endMinute <= startMinute` means the interval
 * crosses local midnight and ends on the next day (night shift).
 */
function ruleToInterval(date: string, rule: WorkingRule, timeZone: string): Interval {
  const start = localToUtc(date, rule.startMinute, timeZone).getTime();
  const end =
    rule.endMinute > rule.startMinute
      ? localToUtc(date, rule.endMinute, timeZone).getTime()
      : localToUtc(addDays(date, 1), rule.endMinute, timeZone).getTime();
  return { start, end };
}

/** Raw WORK and BREAK intervals of a local date. */
export function dayRuleIntervals(
  date: string,
  timeZone: string,
  rules: WorkingRule[],
): { work: Interval[]; breaks: Interval[] } {
  const weekday = weekdayOf(date);
  const ofDay = rules.filter((rule) => rule.weekday === weekday);
  return {
    work: mergeIntervals(
      ofDay.filter((r) => r.kind !== 'BREAK').map((r) => ruleToInterval(date, r, timeZone)),
    ),
    breaks: mergeIntervals(
      ofDay.filter((r) => r.kind === 'BREAK').map((r) => ruleToInterval(date, r, timeZone)),
    ),
  };
}

/** Bookable intervals of a local date: work − breaks − leave. */
export function availableIntervals(
  date: string,
  timeZone: string,
  rules: WorkingRule[],
  leaves: TimeRange[] = [],
): Interval[] {
  const { work, breaks } = dayRuleIntervals(date, timeZone, rules);
  return subtractIntervals(work, [...breaks, ...leaves.map(toInterval)]);
}

/** True when [start, end) lies entirely inside one available interval. */
export function isWithinAvailability(range: TimeRange, available: Interval[]): boolean {
  const target = toInterval(range);
  return available.some((i) => target.start >= i.start && target.end <= i.end);
}

export function periodOf(instant: Date, timeZone: string): DayPeriod {
  const minute = localMinuteOfDay(instant, timeZone);
  if (minute < 12 * 60) return 'MORNING';
  if (minute < 17 * 60) return 'AFTERNOON';
  return 'EVENING';
}

export interface SlotRequest {
  date: string;
  timeZone: string;
  rules: WorkingRule[];
  leaves?: TimeRange[];
  /** Appointments and locks that hold time (CANCELLED / NO_SHOW excluded by caller). */
  busy?: TimeRange[];
  durationMinutes: number;
  stepMinutes: number;
  /** Slots starting before `now` are reported unavailable. */
  now?: Date;
}

/**
 * Every candidate slot of a day. Slots are cut on a `stepMinutes` grid from the
 * start of each available interval; a slot is `available` when it does not
 * overlap a busy range and does not start in the past.
 */
export function generateSlots(request: SlotRequest): GeneratedSlot[] {
  const { durationMinutes, stepMinutes } = request;
  if (durationMinutes <= 0 || stepMinutes <= 0) return [];
  const intervals = availableIntervals(
    request.date,
    request.timeZone,
    request.rules,
    request.leaves ?? [],
  );
  const busy = (request.busy ?? []).map(toInterval);
  const now = request.now?.getTime() ?? Number.NEGATIVE_INFINITY;
  const slots: GeneratedSlot[] = [];
  for (const interval of intervals) {
    for (
      let start = interval.start;
      start + durationMinutes * MINUTE <= interval.end;
      start += stepMinutes * MINUTE
    ) {
      const slot: Interval = { start, end: start + durationMinutes * MINUTE };
      const startsAt = new Date(slot.start);
      slots.push({
        startsAt,
        endsAt: new Date(slot.end),
        available: slot.start >= now && !busy.some((b) => overlaps(b, slot)),
        period: periodOf(startsAt, request.timeZone),
      });
    }
  }
  return slots;
}
