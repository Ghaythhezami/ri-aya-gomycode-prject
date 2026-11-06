export type RangePreset = 'last7' | 'last30' | 'last90' | 'month' | 'custom';

export const RANGE_PRESETS: readonly RangePreset[] = [
  'last7',
  'last30',
  'last90',
  'month',
  'custom',
];

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return format(parse(date) + days * DAY_MS);
}

/** Inclusive number of days in a range. */
export function rangeDays(range: DateRange): number {
  return Math.round((parse(range.to) - parse(range.from)) / DAY_MS) + 1;
}

/** Range for a preset, anchored on the clinic's local `today` (YYYY-MM-DD). */
export function presetRange(preset: RangePreset, today: string, custom?: DateRange): DateRange {
  switch (preset) {
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom':
      return custom ?? { from: addDays(today, -29), to: today };
  }
}

/** The equally long period that ends the day before `range` starts. */
export function previousPeriod(range: DateRange): DateRange {
  const length = rangeDays(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

export const MAX_RANGE_DAYS = 366;

/** A custom range is usable when ordered and not longer than a year. */
export function isValidRange(range: DateRange): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to))
    return false;
  return range.from <= range.to && rangeDays(range) <= MAX_RANGE_DAYS;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface ChangeInfo {
  direction: ChangeDirection;
  /** true = improvement, false = regression, null = no change. */
  good: boolean | null;
}

/** Arrow direction and whether the change is good, for metrics where lower can be better. */
export function changeInfo(value: number, lowerIsBetter = false): ChangeInfo {
  if (!Number.isFinite(value) || value === 0) return { direction: 'flat', good: null };
  const direction: ChangeDirection = value > 0 ? 'up' : 'down';
  const good = lowerIsBetter ? value < 0 : value > 0;
  return { direction, good };
}

/** "+8.4" / "−1.2" / "0" with a real minus sign. */
export function signed(value: number, formatted: string): string {
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted.replace(/^-/, '')}`;
  return formatted;
}

/** Filename from a Content-Disposition header (RFC 5987 `filename*` first), else the fallback. */
export function filenameFromDisposition(
  header: string | undefined | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain filename */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}
