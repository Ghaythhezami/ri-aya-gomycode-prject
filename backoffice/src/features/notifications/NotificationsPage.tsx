import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCheck } from 'lucide-react';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationDto,
} from '@riaya/shared';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Tabs } from '../../common/Tabs';
import { useToast } from '../../common/Toast';
import { useAdaptivePolling } from '../../lib/realtime';
import { asClinicError } from '../../store/clinicApi';
import { PageHeader } from '../shared/PageHeader';
import {
  useLazyNotificationsListQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsListQuery,
} from './api';
import { DeliveryCard } from './DeliveryCard';
import { LiveStatus } from './LiveStatus';
import { countByCategory, groupByDay } from './liveLogic';
import { NotificationRow } from './NotificationRow';
import { mergeById, type NotificationTab } from './templates';
import { UNREAD_POLL_LIVE_MS, UNREAD_POLL_MS, useUnreadCount } from './useUnreadCount';

type PageTab = Extract<NotificationTab, 'all' | 'unread'>;

/** RT-3: clinic notifications with live updates, tabs, category chips, day groups and cursor paging. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<PageTab>('all');
  const [category, setCategory] = useState<NotificationCategory | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ items: NotificationDto[]; next: string | null } | null>(
    null,
  );
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const unread = useUnreadCount();
  const pollingInterval = useAdaptivePolling(UNREAD_POLL_MS, UNREAD_POLL_LIVE_MS);

  const first = useNotificationsListQuery(
    { unread: tab === 'unread', limit: 30 },
    { pollingInterval, skipPollingIfUnfocused: true },
  );
  const [loadMore, loadMoreState] = useLazyNotificationsListQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();

  useEffect(() => {
    setExtra(null);
  }, [tab]);

  const errorText = useCallback(
    (error: unknown) =>
      t(`errors.${asClinicError(error)?.code ?? 'INTERNAL_ERROR'}`, {
        defaultValue: asClinicError(error)?.message ?? '',
      }),
    [t],
  );

  const loaded = useMemo(
    () =>
      mergeById(first.data?.items ?? [], extra?.items ?? []).map((n) =>
        readIds.has(n.id) ? { ...n, read: true } : n,
      ),
    [first.data, extra, readIds],
  );
  const tabItems = useMemo(
    () => (tab === 'unread' ? loaded.filter((n) => !n.read) : loaded),
    [loaded, tab],
  );
  const counts = useMemo(() => countByCategory(tabItems), [tabItems]);
  const items = useMemo(
    () => (category ? tabItems.filter((n) => n.category === category) : tabItems),
    [tabItems, category],
  );
  const groups = useMemo(() => groupByDay(items, Date.now()), [items]);
  const cursor = extra ? extra.next : (first.data?.nextCursor ?? null);
  const tabbableId = items.some((n) => n.id === activeId) ? activeId : (items[0]?.id ?? null);

  const onRead = (id: string) => {
    setReadIds((s) => new Set(s).add(id));
    markRead(id)
      .unwrap()
      .catch((error) => {
        setReadIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        toast.error(errorText(error));
      });
  };

  const onMarkAll = async () => {
    try {
      await markAll().unwrap();
      setReadIds(new Set(loaded.map((n) => n.id)));
      toast.success(t('notifications.allRead'));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const onLoadMore = useCallback(async () => {
    if (!cursor || loadMoreState.isFetching) return;
    try {
      const page = await loadMore({ unread: tab === 'unread', cursor, limit: 30 }).unwrap();
      setExtra((current) => ({
        items: mergeById(current?.items ?? [], page.items),
        next: page.nextCursor,
      }));
    } catch (error) {
      toast.error(errorText(error));
    }
  }, [cursor, loadMoreState.isFetching, loadMore, tab, toast, errorText]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void onLoadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, onLoadMore]);

  const chips: { id: NotificationCategory | null; label: string; count: number }[] = [
    { id: null, label: t('notifications.categories.all'), count: tabItems.length },
    ...NOTIFICATION_CATEGORIES.filter((c) => (counts[c] ?? 0) > 0 || c === category).map((c) => ({
      id: c,
      label: t(`notifications.categories.${c}`),
      count: counts[c] ?? 0,
    })),
  ];

  const list = (
    <div>
      {first.data && tabItems.length > 0 && (
        <div
          role="group"
          aria-label={t('notifications.filterByCategory')}
          className="flex flex-wrap gap-2 border-b border-border px-4 py-3"
        >
          {chips.map((chip) => {
            const selected = chip.id === category;
            return (
              <button
                key={chip.id ?? 'all'}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(chip.id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  selected
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border text-text hover:bg-bg'
                }`}
              >
                {selected && <span aria-hidden="true">✓</span>}
                {chip.label}
                <span className="text-muted">{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}
      {first.isLoading && (
        <div className="space-y-3 p-5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {first.isError && !first.data && (
        <div className="p-5">
          <ErrorState
            title={t('notifications.loadError')}
            description={asClinicError(first.error)?.message}
            action={
              <Button variant="secondary" onClick={() => void first.refetch()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        </div>
      )}
      {first.data && tabItems.length === 0 && (
        <div className="p-5">
          <EmptyState
            title={t(`notifications.empty.${tab}.title`)}
            description={t(`notifications.empty.${tab}.body`)}
            action={
              cursor ? (
                <Button
                  variant="secondary"
                  onClick={() => void onLoadMore()}
                  disabled={loadMoreState.isFetching}
                >
                  {t('notifications.loadMore')}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {first.data && tabItems.length > 0 && items.length === 0 && (
        <div className="p-5">
          <EmptyState
            title={t('notifications.noResults.title')}
            description={t('notifications.noResults.body')}
            action={
              <Button variant="secondary" onClick={() => setCategory(null)}>
                {t('notifications.clearFilter')}
              </Button>
            }
          />
        </div>
      )}
      {groups.length > 0 && (
        <div data-nlist aria-label={t('notifications.title')}>
          {groups.map(({ group, items: rows }) => (
            <section key={group} aria-labelledby={`notif-group-${group}`}>
              <h3
                id={`notif-group-${group}`}
                className="border-b border-border bg-bg px-4 py-2 text-xs font-semibold text-muted sm:px-5"
              >
                {t(`notifications.groups.${group}`)}
              </h3>
              <ul>
                {rows.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    tabbable={n.id === tabbableId}
                    onFocusRow={setActiveId}
                    onRead={onRead}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {cursor && items.length > 0 && (
        <div ref={sentinel} className="border-t border-border p-4 text-center">
          <Button
            variant="secondary"
            onClick={() => void onLoadMore()}
            disabled={loadMoreState.isFetching}
          >
            {loadMoreState.isFetching ? t('clinic.loading') : t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t('notifications.eyebrow')}
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveStatus />
            <Button
              variant="secondary"
              onClick={() => void onMarkAll()}
              disabled={markAllState.isLoading || unread === 0}
            >
              <CheckCheck size={16} aria-hidden="true" />
              {t('notifications.markAll')}
            </Button>
          </div>
        }
      />
      <p className="sr-only" aria-live="polite">
        {t('notifications.unreadLive', { count: unread })}
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 rounded-lg border border-border bg-surface shadow-(--shadow-card)">
          <div className="pt-2 [&_[role=tablist]]:px-4 [&_[role=tabpanel]]:pt-0">
            <Tabs
              label={t('notifications.title')}
              value={tab}
              onChange={(id) => {
                setTab(id as PageTab);
                setCategory(null);
              }}
              tabs={[
                { id: 'all', label: t('notifications.tabs.all'), content: list },
                {
                  id: 'unread',
                  label: t('notifications.tabs.unread'),
                  count: unread,
                  content: list,
                },
              ]}
            />
          </div>
        </section>
        <DeliveryCard />
      </div>
    </div>
  );
}
