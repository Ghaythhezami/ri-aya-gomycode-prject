/**
 * Clinic-local time helpers (I18N-2, DOC-2).
 *
 * Everything is stored in UTC. Working hours are expressed as "minutes after local
 * midnight" in the clinic's IANA time zone, so converting them to instants must go
 * through the zone's offset ON THAT DATE — a fixed offset is wrong across daylight
 * saving changes. These helpers use `Intl` only (no date library) and are pure.
 */

const MINUTE = 60_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in a time zone. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? 'Sun'] ?? 0,
  };
}

/** Offset of the zone from UTC at `instant`, in minutes (Dubai → +240). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

/** Parse `YYYY-MM-DD`; throws on anything else. */
export function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * The UTC instant of `minuteOfDay` minutes after local midnight on `date` in
 * `timeZone`. A wall-clock time that does not exist (spring-forward gap) resolves
 * forward by the gap; an ambiguous one (fall-back) resolves to the first occurrence.
 */
export function localToUtc(date: string, minuteOfDay: number, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0) + minuteOfDay * MINUTE;
  // Two passes converge for every real-world zone (offset changes at most once a day).
  let offset = zoneOffsetMinutes(new Date(naive), timeZone);
  let result = naive - offset * MINUTE;
  const second = zoneOffsetMinutes(new Date(result), timeZone);
  if (second !== offset) {
    offset = second;
    result = naive - offset * MINUTE;
  }
  return new Date(result);
}

/** Local `YYYY-MM-DD` of an instant. */
export function toLocalDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes after local midnight of an instant. */
export function localMinuteOfDay(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Weekday (0 = Sunday) of a local date — independent of any time zone. */
export function weekdayOf(date: string): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Add whole days to a local date string. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseLocalDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/** [start, end) of a local day as UTC instants (23 or 25 hours on DST days). */
export function localDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  return { start: localToUtc(date, 0, timeZone), end: localToUtc(addDays(date, 1), 0, timeZone) };
}

/** Today's local date in a zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return toLocalDate(now, timeZone);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE);
}

/** "08:00" for 480. */
export function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
