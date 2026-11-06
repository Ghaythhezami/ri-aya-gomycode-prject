/**
 * Call order of the waiting queue (QUE-1): priority (EMERGENCY, URGENT, NORMAL), then
 * the earlier appointment time, then the earlier check-in. Ties fall back to the queue
 * number so the order is total and stable. The SQL in QueueService mirrors this order.
 */
export type OrderPriority = 'EMERGENCY' | 'URGENT' | 'NORMAL';

export interface OrderableEntry {
  number: string;
  priority: OrderPriority | string;
  appointmentStartsAt: number;
  checkedInAt: number;
}

export const PRIORITY_RANK: Record<string, number> = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };

export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.NORMAL!;
}

export function compareQueueEntries(a: OrderableEntry, b: OrderableEntry): number {
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;
  if (a.appointmentStartsAt !== b.appointmentStartsAt) {
    return a.appointmentStartsAt - b.appointmentStartsAt;
  }
  if (a.checkedInAt !== b.checkedInAt) return a.checkedInAt - b.checkedInAt;
  return a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
}

/** Display number: 'A' + 3-digit sequence ("A007"). */
export function formatQueueNumber(sequence: number): string {
  return `A${String(sequence).padStart(3, '0')}`;
}

/** Next sequence after the highest existing number of the day (numbers like "A012"). */
export function nextQueueSequence(existingNumbers: string[]): number {
  let max = 0;
  for (const n of existingNumbers) {
    const parsed = Number(n.replace(/\D/g, ''));
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}
