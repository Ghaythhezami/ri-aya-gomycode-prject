import type { RealtimeStatus } from './types';

/**
 * Polling interval for a live query. While the socket is connected the push events keep the
 * cache fresh, so polling only needs to be a slow safety net; otherwise keep the fast fallback.
 */
export function pollingIntervalFor(
  status: RealtimeStatus,
  fallbackMs: number,
  liveMs: number,
): number {
  return status === 'connected' ? liveMs : fallbackMs;
}
