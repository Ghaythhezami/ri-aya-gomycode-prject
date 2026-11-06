import type { NotificationDto, NotificationPage } from '@riaya/shared';
import {
  addNotificationToPage,
  badgeText,
  bumpCount,
  countByCategory,
  groupByDay,
  isHighPriority,
  markPageRead,
} from './liveLogic';

const n = (id: string, over: Partial<NotificationDto> = {}): NotificationDto => ({
  id,
  category: 'SYSTEM',
  titleKey: 'notifications.templates.optimized.title',
  bodyKey: 'notifications.templates.optimized.body',
  params: {},
  entityType: null,
  entityId: null,
  read: false,
  createdAt: '2026-11-06T09:00:00',
  ...over,
});
const page = (items: NotificationDto[], unreadCount = 1): NotificationPage => ({
  items,
  nextCursor: null,
  unreadCount,
});

describe('groupByDay', () => {
  const now = new Date('2026-11-06T15:00:00').getTime();
  it('splits into today, yesterday and earlier, in order, without empty groups', () => {
    const items = [
      { createdAt: '2026-11-06T08:00:00', id: 'a' },
      { createdAt: '2026-11-05T23:30:00', id: 'b' },
      { createdAt: '2026-11-01T10:00:00', id: 'c' },
      { createdAt: '2026-10-01T10:00:00', id: 'd' },
    ];
    const groups = groupByDay(items, now);
    expect(groups.map((g) => g.group)).toEqual(['today', 'yesterday', 'earlier']);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(['c', 'd']);
    expect(groupByDay([items[0]!], now).map((g) => g.group)).toEqual(['today']);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('cache reducers', () => {
  it('prepends a new notification once and takes the server count', () => {
    const next = addNotificationToPage(page([n('a')]), n('b'), { limit: 6 }, 4);
    expect(next.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(next.unreadCount).toBe(4);
    const again = addNotificationToPage(next, n('b'), { limit: 6 }, null);
    expect(again.items).toHaveLength(2);
    expect(again.unreadCount).toBe(4);
  });
  it('adds one for a broadcast without a count, capped at 100', () => {
    expect(addNotificationToPage(page([], 3), n('x'), {}, null).unreadCount).toBe(4);
    expect(addNotificationToPage(page([], 100), n('x'), {}, null).unreadCount).toBe(100);
  });
  it('leaves cursor pages and read items on the unread list alone', () => {
    const p = page([n('a')]);
    expect(addNotificationToPage(p, n('b'), { cursor: 'c' }, 2)).toBe(p);
    expect(
      addNotificationToPage(p, n('b', { read: true }), { unread: true }, 1).items,
    ).toHaveLength(1);
  });
  it('marks one or all items read', () => {
    const p = page([n('a'), n('b')], 2);
    expect(markPageRead(p, ['a']).items.map((i) => i.read)).toEqual([true, false]);
    const all = markPageRead(p, 'all', 0);
    expect(all.items.every((i) => i.read)).toBe(true);
    expect(all.unreadCount).toBe(0);
  });
  it('bumps within bounds and formats the badge', () => {
    expect(bumpCount(99)).toBe(100);
    expect(bumpCount(100)).toBe(100);
    expect(bumpCount(0, -1)).toBe(0);
    expect(badgeText(7)).toBe('7');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('categories and priority', () => {
  it('counts per category', () => {
    expect(
      countByCategory([{ category: 'DELAY' }, { category: 'DELAY' }, { category: 'SYSTEM' }]),
    ).toEqual({ DELAY: 2, SYSTEM: 1 });
  });
  it('flags unread conflicts, cancellations and emergencies', () => {
    expect(isHighPriority(n('a', { category: 'CONFLICT' }))).toBe(true);
    expect(isHighPriority(n('a', { category: 'CANCELLATION' }))).toBe(true);
    expect(isHighPriority(n('a', { titleKey: 'notifications.templates.emergency.title' }))).toBe(
      true,
    );
    expect(isHighPriority(n('a', { category: 'CONFLICT', read: true }))).toBe(false);
    expect(isHighPriority(n('a', { category: 'REMINDER' }))).toBe(false);
  });
});
