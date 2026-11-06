/**
 * Pure date helpers shared by the calendar, the appointment filters, the booking
 * wizard and the dashboard.
 *
 * A "ymd" is a clinic-local calendar date (`YYYY-MM-DD`) with no zone of its own, so
 * day arithmetic runs in UTC and can never drift across a DST change. Instants are
 * converted to the clinic zone with `Intl` (formatters are cached per zone because
 * the week grid converts hundreds of appointments).
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = YMD.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(ymd: string, days: number): string {
  const date = toDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDate(date);
}

export function addMonths(ymd: string, months: number): string {
  const date = toDate(ymd);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return fromDate(date);
}

/** 0 = Sunday, matching the API's `weekday`. */
export function weekdayIndex(ymd: string): number {
  return toDate(ymd).getUTCDay();
}

/** Monday of the week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const offset = (weekdayIndex(ymd) + 6) % 7;
  return addDays(ymd, -offset);
}

export function weekDays(ymd: string): string[] {
  const start = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Six Monday-first weeks covering the month of `ymd` (42 cells). */
export function monthGrid(ymd: string): string[] {
  const start = startOfWeek(startOfMonth(ymd));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type CalendarView = 'day' | 'week' | 'month';

/** Inclusive `from`/`to` of the range a calendar view shows. */
export function viewRange(view: CalendarView, ymd: string): { from: string; to: string } {
  if (view === 'day') return { from: ymd, to: ymd };
  if (view === 'week') {
    const start = startOfWeek(ymd);
    return { from: start, to: addDays(start, 6) };
  }
  const grid = monthGrid(ymd);
  return { from: grid[0]!, to: grid[grid.length - 1]! };
}

export function shiftView(view: CalendarView, ymd: string, direction: 1 | -1): string {
  if (view === 'day') return addDays(ymd, direction);
  if (view === 'week') return addDays(ymd, 7 * direction);
  return addMonths(ymd, direction);
}

// ---------------------------------------------------------------- zones

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  ymd: string;
  /** Minutes after local midnight. */
  minutes: number;
}

/** Clinic-local date and minute-of-day of an instant. */
export function zonedParts(value: string | number | Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

function offsetMinutes(instant: number, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const local = Date.UTC(
    Number(parts.ymd.slice(0, 4)),
    Number(parts.ymd.slice(5, 7)) - 1,
    Number(parts.ymd.slice(8, 10)),
    0,
    parts.minutes,
  );
  return Math.round((local - Math.floor(instant / 60000) * 60000) / 60000);
}

/** ISO instant for a clinic-local date and minute-of-day. */
export function zonedToInstant(ymd: string, minutes: number, timeZone: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let instant = naive - offsetMinutes(naive, timeZone) * 60000;
  // A second pass settles the offset when the first guess landed across a DST edge.
  instant = naive - offsetMinutes(instant, timeZone) * 60000;
  return new Date(instant).toISOString();
}

/** Clinic-local "today". */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return zonedParts(now, timeZone).ymd;
}

/** `GMT+4` style label of the zone, for the calendar's time column header. */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** Latin-digit locale tag, as in `useClinicFormat`. */
export function localeTag(locale: string): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : locale;
}

/** Format a calendar date (no zone) in the UI locale. */
export function formatYmd(
  ymd: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(localeTag(locale), { ...options, timeZone: 'UTC' }).format(
    toDate(ymd),
  );
}

/** "Apr 21 – 25, 2025" style range label. */
export function formatYmdRange(from: string, to: string, locale: string): string {
  const formatter = new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return from === to
    ? formatter.format(toDate(from))
    : formatter.formatRange(toDate(from), toDate(to));
}
