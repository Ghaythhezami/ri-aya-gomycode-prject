import { addDays, rangeDays, type DateRange } from '../analytics/ranges';

export type { DateRange };

export type PeriodPreset = 'today' | 'thisWeek' | 'nextWeek' | 'thisMonth' | 'last30' | 'custom';

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'today',
  'thisWeek',
  'nextWeek',
  'thisMonth',
  'last30',
  'custom',
];

/** The API accepts at most this many days per request. */
export const MAX_PERIOD_DAYS = 92;

/** First day of the week per UI language, 0 = Sunday ... 6 = Saturday. The clinic week starts Monday. */
export const WEEK_START: Record<string, number> = { en: 1, fr: 1, ar: 1 };

export function weekStartFor(locale: string | undefined): number {
  return WEEK_START[(locale ?? 'en').slice(0, 2)] ?? 1;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** Last calendar day of the month of `date`. */
export function monthEnd(date: string): string {
  const d = parse(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** First day of the week containing `date`. */
export function weekStartOf(date: string, weekStart = 1): string {
  const back = (parse(date).getUTCDay() - weekStart + 7) % 7;
  return addDays(date, -back);
}

/** Range for a preset, anchored on the clinic's local `today` (YYYY-MM-DD). */
export function periodRange(
  preset: PeriodPreset,
  today: string,
  weekStart = 1,
  custom?: DateRange,
): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek': {
      const from = weekStartOf(today, weekStart);
      return { from, to: addDays(from, 6) };
    }
    case 'nextWeek': {
      const from = addDays(weekStartOf(today, weekStart), 7);
      return { from, to: addDays(from, 6) };
    }
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: monthEnd(today) };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'custom':
      return custom ?? { from: addDays(today, -6), to: today };
  }
}

/** The preset that produces exactly `range`, else 'custom'. */
export function detectPreset(range: DateRange, today: string, weekStart = 1): PeriodPreset {
  for (const preset of PERIOD_PRESETS) {
    if (preset === 'custom') continue;
    const r = periodRange(preset, today, weekStart);
    if (r.from === range.from && r.to === range.to) return preset;
  }
  return 'custom';
}

/** Move a period by its own length (`direction` 1 = next, -1 = previous). */
export function shiftPeriod(range: DateRange, direction: 1 | -1): DateRange {
  const length = rangeDays(range);
  return {
    from: addDays(range.from, direction * length),
    to: addDays(range.to, direction * length),
  };
}

export type PeriodError = 'invalid' | 'order' | 'tooLong';

/** Why a range is unusable, or null when it is ordered and at most MAX_PERIOD_DAYS long. */
export function periodError(range: DateRange): PeriodError | null {
  if (!ISO.test(range.from) || !ISO.test(range.to)) return 'invalid';
  if (range.from > range.to) return 'order';
  if (rangeDays(range) > MAX_PERIOD_DAYS) return 'tooLong';
  return null;
}

export function isValidPeriod(range: DateRange): boolean {
  return periodError(range) === null;
}
