import { useRealtimeStatus } from './RealtimeContext';
import { pollingIntervalFor } from './polling';

/** `pollingInterval` for an RTK Query hook: `fallbackMs` unless the socket is connected, then `liveMs`. */
export function useAdaptivePolling(fallbackMs: number, liveMs: number): number {
  return pollingIntervalFor(useRealtimeStatus(), fallbackMs, liveMs);
}
