import type { NotificationCategory, NotificationDto, NotificationPage } from '@riaya/shared';
import type { NotificationListArgs } from './api';
import { templateName } from './templates';

/** Unread counts from the API are capped at 100 (the UI shows 99+). */
export const UNREAD_CAP = 100;

export type DayGroup = 'today' | 'yesterday' | 'earlier';

/** Local calendar day as YYYY-MM-DD. */
export function localDayKey(value: number | string | Date): string {
  const d = new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Bucket one instant relative to `now`. `dayKey` is injectable to group by the clinic zone. */
export function dayGroupOf(
  iso: string,
  now: number,
  dayKey: (value: number | string) => string = localDayKey,
): DayGroup {
  const key = dayKey(iso);
  if (key === dayKey(now)) return 'today';
  // Noon of the previous day avoids DST edge cases when subtracting 24 h.
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return key === dayKey(yesterday.getTime()) ? 'yesterday' : 'earlier';
}

/** Group an ordered list into Today / Yesterday / Earlier, dropping empty groups, keeping order. */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now: number,
  dayKey?: (value: number | string) => string,
): { group: DayGroup; items: T[] }[] {
  const buckets: Record<DayGroup, T[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of items) buckets[dayGroupOf(item.createdAt, now, dayKey)].push(item);
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((group) => buckets[group].length > 0)
    .map((group) => ({ group, items: buckets[group] }));
}

/** Count of notifications per category (for the filter chips). */
export function countByCategory(
  items: Pick<NotificationDto, 'category'>[],
): Partial<Record<NotificationCategory, number>> {
  const out: Partial<Record<NotificationCategory, number>> = {};
  for (const { category } of items) out[category] = (out[category] ?? 0) + 1;
  return out;
}

const HIGH_PRIORITY: readonly NotificationCategory[] = ['CONFLICT', 'CANCELLATION'];

/** New notifications that deserve a toast: conflicts, cancellations and emergencies. */
export function isHighPriority(
  n: Pick<NotificationDto, 'category' | 'titleKey' | 'read'>,
): boolean {
  if (n.read) return false;
  return HIGH_PRIORITY.includes(n.category) || templateName(n.titleKey) === 'emergency';
}

/** Add one to an unread count without passing the cap. */
export function bumpCount(count: number, delta = 1): number {
  return Math.min(UNREAD_CAP, Math.max(0, count + delta));
}

/** Text of the bell badge. */
export function badgeText(count: number): string {
  return count > UNREAD_CAP - 1 ? '99+' : String(count);
}

/**
 * Cache reducer for `notification.created`: put the new item first in a first-page list
 * (never in a cursor page), respecting the unread filter, once.
 */
export function addNotificationToPage(
  page: NotificationPage,
  n: NotificationDto,
  args: NotificationListArgs,
  unreadCount: number | null,
): NotificationPage {
  if (args.cursor) return page;
  const already = page.items.some((item) => item.id === n.id);
  const skip = already || (args.unread === true && n.read);
  return {
    ...page,
    items: skip ? page.items : [n, ...page.items],
    unreadCount: unreadCount ?? (skip ? page.unreadCount : bumpCount(page.unreadCount)),
  };
}

/** Cache reducer for read events: mark `ids` (or everything with `'all'`) read. */
export function markPageRead(
  page: NotificationPage,
  ids: string[] | 'all',
  unreadCount?: number,
): NotificationPage {
  const hit = (id: string) => ids === 'all' || ids.includes(id);
  return {
    ...page,
    items: page.items.map((item) => (!item.read && hit(item.id) ? { ...item, read: true } : item)),
    unreadCount: unreadCount ?? page.unreadCount,
  };
}

/** Interval label for the "Offline - updating every N s" indicator. */
export function secondsOf(ms: number): number {
  return Math.round(ms / 1000);
}
