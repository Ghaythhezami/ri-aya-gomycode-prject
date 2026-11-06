/** Cross-field rules for clinic settings that decorators cannot express. */
export interface OpeningDayInput {
  weekday: number;
  open: number;
  close: number;
  closed: boolean;
}

/** Returns a list of problems; empty when valid. */
export function openingHoursProblems(days: OpeningDayInput[]): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const day of days) {
    if (seen.has(day.weekday)) problems.push(`weekday ${day.weekday} appears twice`);
    seen.add(day.weekday);
    if (!day.closed && day.open >= day.close) {
      problems.push(`weekday ${day.weekday}: open must be before close`);
    }
  }
  return problems;
}

export function offsetsProblems(offsets: number[]): string[] {
  return new Set(offsets).size === offsets.length ? [] : ['reminderOffsets must be unique'];
}
