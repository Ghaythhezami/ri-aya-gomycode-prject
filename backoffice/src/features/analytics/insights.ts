import type { InsightRate, InsightRecommendation } from '@riaya/shared';

/** Lead-time buckets in display order (shortest to longest). */
export const LEAD_TIME_KEYS = ['0-1d', '2-7d', '8-30d', '31d+'] as const;
export type LeadTimeKey = (typeof LEAD_TIME_KEYS)[number];

/** Number of intensity steps above "no demand" used by the heatmap legend. */
export const INTENSITY_STEPS = 5;

export interface HourSpan {
  start: number;
  end: number;
}

/** First and last hour (inclusive) with any demand, or null when the matrix is empty. */
export function trimHourSpan(matrix: number[][]): HourSpan | null {
  let start = Infinity;
  let end = -Infinity;
  for (const row of matrix) {
    row.forEach((count, hour) => {
      if (count > 0) {
        start = Math.min(start, hour);
        end = Math.max(end, hour);
      }
    });
  }
  return start === Infinity ? null : { start, end };
}

export function matrixMax(matrix: number[][]): number {
  return matrix.reduce((m, row) => Math.max(m, ...row), 0);
}

/** 0 = no bookings, 1..5 = increasing share of the busiest cell. */
export function intensityStep(count: number, max: number): number {
  if (!(count > 0) || !(max > 0)) return 0;
  return Math.min(INTENSITY_STEPS, Math.max(1, Math.ceil((count / max) * INTENSITY_STEPS)));
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Smoothed rate 0..1 as a percent number with at most one decimal. */
export function ratePercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

/** Lead-time rows in the fixed bucket order; unknown buckets go last. */
export function sortLeadTime(rows: InsightRate[]): InsightRate[] {
  const order = (key: string) => {
    const i = (LEAD_TIME_KEYS as readonly string[]).indexOf(key);
    return i === -1 ? LEAD_TIME_KEYS.length : i;
  };
  return [...rows].sort((a, b) => order(a.key) - order(b.key));
}

/** Weekday rows ordered Monday (0) to Sunday (6). */
export function sortWeekdays(rows: InsightRate[]): InsightRate[] {
  return [...rows].sort((a, b) => Number(a.key) - Number(b.key));
}

export interface DemandCell {
  weekday: number;
  hour: number;
  count: number;
}

/** Non-zero cells sorted by count (desc), then weekday and hour. */
export function demandCells(matrix: number[][]): DemandCell[] {
  const cells: DemandCell[] = [];
  matrix.forEach((row, weekday) =>
    row.forEach((count, hour) => {
      if (count > 0) cells.push({ weekday, hour, count });
    }),
  );
  return cells.sort((a, b) => b.count - a.count || a.weekday - b.weekday || a.hour - b.hour);
}

export interface RecommendationFormatters {
  weekday: (weekday: number) => string;
  number: (value: number) => string;
  list: (items: string[]) => string;
}

export interface DescribedRecommendation {
  /** Key below `analytics.insights.rec`. */
  key: 'highNoShow' | 'peak' | 'underused' | 'underusedUnnamed';
  values: Record<string, string>;
}

/** i18n key and interpolation values for one recommendation. */
export function describeRecommendation(
  rec: InsightRecommendation,
  f: RecommendationFormatters,
  maxCells = 5,
): DescribedRecommendation {
  switch (rec.kind) {
    case 'HIGH_NO_SHOW_SLOT':
      return {
        key: 'highNoShow',
        values: {
          weekday: f.weekday(rec.params.weekday),
          time: hourLabel(rec.params.hour),
          rate: f.number(Math.round(rec.params.rate * 100)),
          count: f.number(rec.params.count),
        },
      };
    case 'PEAK_HOURS':
      return {
        key: 'peak',
        values: {
          cells: f.list(
            rec.params.cells
              .slice(0, maxCells)
              .map((c) => `${f.weekday(c.weekday)} ${hourLabel(c.hour)} (${f.number(c.count)})`),
          ),
        },
      };
    case 'UNDERUSED_DOCTOR':
      return {
        key: rec.params.doctorName ? 'underused' : 'underusedUnnamed',
        values: {
          name: rec.params.doctorName ?? '',
          booked: f.number(Math.round(rec.params.bookedMinutes)),
          median: f.number(Math.round(rec.params.medianMinutes)),
        },
      };
  }
}
