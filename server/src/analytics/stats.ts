import { addDays } from '../core/clinic-time';

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Percentage change; 0 when both are 0, 100 when growing from 0. */
export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The range of the same length immediately before [from, to]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = dateRange(from, to).length;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(days - 1)), to: prevTo };
}
