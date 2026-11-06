/** Reconnect schedule: exponential from 1 s, capped at 30 s, with "equal" jitter. */
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/** Upper bound of the delay for the (zero-based) retry `attempt`. */
export function backoffCeiling(attempt: number): number {
  const exponent = Math.min(Math.max(0, Math.floor(attempt)), 16);
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
}

/**
 * Delay before retry number `attempt`: half the ceiling plus a random half, so a fleet of
 * clients that lost the server together does not reconnect in lockstep.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = backoffCeiling(attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
