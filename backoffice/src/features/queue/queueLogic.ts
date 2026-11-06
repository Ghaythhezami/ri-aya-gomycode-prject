import type { QueueEntryDto } from '@riaya/shared';

/** Statuses where the patient is still waiting for a doctor. */
export const WAITING_STATUSES: readonly QueueEntryDto['status'][] = ['WAITING'];
/** Statuses that still need an action from the desk. */
export const OPEN_STATUSES: readonly QueueEntryDto['status'][] = [
  'WAITING',
  'CALLED',
  'IN_CONSULTATION',
];

/**
 * Waiting minutes to display: the server value plus the time elapsed since it
 * was fetched, while the patient is still WAITING (CALLED and later stop counting).
 */
export function displayedWait(entry: QueueEntryDto, elapsedMs: number): number {
  const extra = entry.status === 'WAITING' ? Math.max(0, Math.floor(elapsedMs / 60_000)) : 0;
  return entry.waitingMinutes + extra;
}

/** Over target by the server flag, or by the locally ticking value. */
export function isOverTarget(entry: QueueEntryDto, shownMinutes: number, target: number): boolean {
  if (entry.status !== 'WAITING' && entry.status !== 'CALLED') return false;
  return entry.overTarget || shownMinutes > target;
}
