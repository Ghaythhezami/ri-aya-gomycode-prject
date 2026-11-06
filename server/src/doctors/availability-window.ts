import {
  availableIntervals,
  mergeIntervals,
  type Interval,
  type TimeRange,
  type WorkingRule,
} from '../core/availability';
import { addDays, toLocalDate } from '../core/clinic-time';

/** Local dates whose intervals can contain an instant: the day before (night shifts) and the day itself. */
export function candidateDates(instant: Date, timeZone: string): string[] {
  const date = toLocalDate(instant, timeZone);
  return [addDays(date, -1), date];
}

/** Union of bookable intervals over several local dates. */
export function availableForDates(
  dates: string[],
  timeZone: string,
  rules: WorkingRule[],
  leaves: TimeRange[],
): Interval[] {
  return mergeIntervals(dates.flatMap((d) => availableIntervals(d, timeZone, rules, leaves)));
}

/** `count` consecutive local dates starting at `from`. */
export function dateRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}
