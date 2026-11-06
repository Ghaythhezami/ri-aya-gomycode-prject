import { useAdaptivePolling } from '../../lib/realtime';
import { useUnreadNotificationCountQuery } from './api';

/** Fallback poll while the socket is down, and the slow safety net while it is up. */
export const UNREAD_POLL_MS = 20_000;
export const UNREAD_POLL_LIVE_MS = 120_000;

/**
 * Unread notification count for the sidebar badge and the bell (RT-3).
 * Polls every 20 s as the fallback; once the realtime socket is connected the push events
 * keep it exact and polling slows to 120 s. Any mutation that invalidates the `Notification`
 * tag refreshes it at once, and a window focus refetches it, which keeps several tabs in agreement.
 */
export function useUnreadCount(): number {
  const pollingInterval = useAdaptivePolling(UNREAD_POLL_MS, UNREAD_POLL_LIVE_MS);
  const { data } = useUnreadNotificationCountQuery(undefined, {
    pollingInterval,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  return data?.count ?? 0;
}
