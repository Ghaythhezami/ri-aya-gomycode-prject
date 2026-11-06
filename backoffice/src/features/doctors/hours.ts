import type { WorkingInterval } from '@riaya/shared';

export type HoursIssueCode = 'START_AFTER_END' | 'OVERLAP' | 'BREAK_OUTSIDE_WORK';

export interface HoursIssue {
  weekday: number;
  code: HoursIssueCode;
  /** Index in the flat interval list of the offending interval. */
  index: number;
}

export function minutesToTime(minutes: number): string {
  if (!Number.isFinite(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" to minutes since midnight; NaN when empty or malformed. */
export function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Validate a flat interval list: start must precede end, intervals of the same
 * kind on a day must not overlap, and every break must sit inside a work interval.
 */
export function validateIntervals(intervals: WorkingInterval[]): HoursIssue[] {
  const issues: HoursIssue[] = [];
  const valid = (i: WorkingInterval) =>
    Number.isFinite(i.startMinute) && Number.isFinite(i.endMinute) && i.startMinute < i.endMinute;

  intervals.forEach((interval, index) => {
    if (!valid(interval))
      issues.push({ weekday: interval.weekday, code: 'START_AFTER_END', index });
  });

  for (const kind of ['WORK', 'BREAK'] as const) {
    const same = intervals
      .map((interval, index) => ({ interval, index }))
      .filter((x) => x.interval.kind === kind && valid(x.interval));
    for (let a = 0; a < same.length; a++) {
      for (let b = a + 1; b < same.length; b++) {
        const x = same[a]!;
        const y = same[b]!;
        if (x.interval.weekday !== y.interval.weekday) continue;
        if (
          x.interval.startMinute < y.interval.endMinute &&
          y.interval.startMinute < x.interval.endMinute
        ) {
          issues.push({ weekday: y.interval.weekday, code: 'OVERLAP', index: y.index });
        }
      }
    }
  }

  intervals.forEach((interval, index) => {
    if (interval.kind !== 'BREAK' || !valid(interval)) return;
    const inside = intervals.some(
      (w) =>
        w.kind === 'WORK' &&
        valid(w) &&
        w.weekday === interval.weekday &&
        w.startMinute <= interval.startMinute &&
        interval.endMinute <= w.endMinute,
    );
    if (!inside) issues.push({ weekday: interval.weekday, code: 'BREAK_OUTSIDE_WORK', index });
  });

  return issues;
}

/** Week order per UI language (0 = Sunday). */
export function weekdayOrder(locale: string): number[] {
  if (locale.startsWith('ar')) return [6, 0, 1, 2, 3, 4, 5];
  if (locale.startsWith('fr')) return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/** Localised weekday name via Intl (2026-01-04 is a Sunday). */
export function weekdayName(
  weekday: number,
  locale: string,
  width: 'long' | 'short' = 'long',
): string {
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  return new Intl.DateTimeFormat(tag, { weekday: width, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 0, 4 + weekday)),
  );
}

/** Does this doctor profile belong to the signed-in DOCTOR? (the API enforces it anyway) */
export function isOwnProfile(
  user: { role: string; firstName: string; lastName: string } | null,
  doctor: { firstName: string; lastName: string },
): boolean {
  if (!user || user.role !== 'DOCTOR') return false;
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    norm(user.firstName) === norm(doctor.firstName) && norm(user.lastName) === norm(doctor.lastName)
  );
}

/**
 * Instant for a clinic-local date and time (`YYYY-MM-DD`, minutes after midnight)
 * in an IANA zone, as ISO UTC.
 */
export function zonedInstant(date: string, minutes: number, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, minutes);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asLocal - guess)).toISOString();
}

/** Visible window of the weekly visual, rounded to whole hours. */
export function timelineRange(intervals: WorkingInterval[]): { start: number; end: number } {
  if (intervals.length === 0) return { start: 8 * 60, end: 18 * 60 };
  const start = Math.floor(Math.min(...intervals.map((i) => i.startMinute)) / 60) * 60;
  const end = Math.ceil(Math.max(...intervals.map((i) => i.endMinute)) / 60) * 60;
  return { start, end: Math.max(end, start + 60) };
}
