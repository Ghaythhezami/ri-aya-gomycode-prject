import { useUnreadNotificationCountQuery } from './api';

/**
 * Unread notification count for the sidebar badge and the bell (RT-3).
 * Polls every 20 s as the fallback when the realtime socket is unavailable;
 * any mutation that invalidates the `Notification` tag refreshes it at once,
 * and a window focus refetches it, which keeps several open tabs in agreement.
 */
export function useUnreadCount(): number {
  const { data } = useUnreadNotificationCountQuery(undefined, {
    pollingInterval: 20_000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  return data?.count ?? 0;
}
