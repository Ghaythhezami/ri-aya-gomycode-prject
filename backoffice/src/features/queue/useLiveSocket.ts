import { useRealtimeEvent, useRealtimeStatus } from '../../lib/realtime';

/**
 * Queue and appointment events from the shared realtime socket (`lib/realtime`).
 * Calls `onEvent` on every queue/appointment event and after each reconnect (to catch up).
 * `enabled` is false when the server has no realtime configured (or nobody is signed in);
 * `paused` is true while the socket is not connected, so the screen can say live updates are
 * paused. Polling keeps running as the fallback either way.
 */
export function useLiveSocket(onEvent: () => void): { enabled: boolean; paused: boolean } {
  const status = useRealtimeStatus();
  useRealtimeEvent('queue.updated', onEvent);
  useRealtimeEvent('appointment.created', onEvent);
  useRealtimeEvent('appointment.updated', onEvent);
  useRealtimeEvent('appointment.cancelled', onEvent);
  useRealtimeEvent('appointment.rescheduled', onEvent);
  useRealtimeEvent('reconnected', onEvent);
  const enabled = status !== 'disabled';
  return { enabled, paused: enabled && status !== 'connected' };
}
