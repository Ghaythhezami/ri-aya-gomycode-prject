import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, CheckCheck, Send } from 'lucide-react';
import { can, type NotificationDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Tabs } from '../../common/Tabs';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { PageHeader } from '../shared/PageHeader';
import { useClinicFormat } from '../shared/format';
import {
  useLazyNotificationsListQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationDeliveryStatsQuery,
  useNotificationsListQuery,
} from './api';
import { entityPath, matchesTab, mergeById, tileFor, type NotificationTab } from './templates';
import { useNotificationText } from './useNotificationText';
import { useUnreadCount } from './useUnreadCount';

function Item({
  n,
  read,
  onRead,
}: {
  n: NotificationDto;
  read: boolean;
  onRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const text = useNotificationText();
  const { Icon, className } = tileFor(n);
  const { title, body } = text.render(n);
  const path = entityPath(n);
  return (
    <li
      className={`flex items-start gap-4 border-b border-border px-5 py-4 last:border-b-0 ${
        read ? '' : 'bg-accent/30'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-md ${className}`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          {title}
          {!read && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
              {t('notifications.new')}
            </span>
          )}
        </p>
        {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
        <p className="mt-1 text-xs text-muted">{text.ago(n.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {path && (
          <Link
            to={path}
            onClick={() => !read && onRead(n.id)}
            className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
          >
            {t('notifications.view')}
          </Link>
        )}
        {!read && (
          <button
            type="button"
            onClick={() => onRead(n.id)}
            aria-label={t('notifications.markRead')}
            title={t('notifications.markRead')}
            className="grid size-10 place-items-center rounded-md text-muted hover:bg-accent hover:text-primary"
          >
            <Check size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

function DeliveryCard() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { user } = useAuth();
  const stats = useNotificationDeliveryStatsQuery(undefined, {
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });
  const d = stats.data;
  const rows: { label: string; value: number; warn?: boolean }[] = d
    ? [
        { label: t('notifications.delivery.sms'), value: d.sms },
        { label: t('notifications.delivery.email'), value: d.email },
        { label: t('notifications.delivery.pending'), value: d.pending },
        { label: t('notifications.delivery.failed'), value: d.failed, warn: d.failed > 0 },
      ]
    : [];
  return (
    <aside
      aria-label={t('notifications.delivery.title')}
      className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-text">
        {t('notifications.delivery.title')}
      </h2>
      <div className="p-5">
        {stats.isLoading && <Skeleton className="h-24" />}
        {stats.isError && !d && (
          <div className="text-sm text-error" role="alert">
            {t('notifications.delivery.error')}{' '}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void stats.refetch()}
            >
              {t('clinic.retry')}
            </button>
          </div>
        )}
        {d && (
          <>
            <div className="rounded-md bg-accent p-4 text-center">
              <p className="text-3xl font-semibold text-primary">
                {fmt.number(d.successRate, { maximumFractionDigits: 1 })}%
              </p>
              <p className="text-xs text-primary-dark">{t('notifications.delivery.success')}</p>
            </div>
            <dl className="mt-3">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-b-0"
                >
                  <dt className="flex items-center gap-1.5 text-muted">
                    {r.warn && (
                      <AlertTriangle size={13} aria-hidden="true" className="text-error" />
                    )}
                    {r.label}
                  </dt>
                  <dd className={`font-semibold ${r.warn ? 'text-error' : 'text-text'}`}>
                    {fmt.number(r.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {can(user?.role, 'manageSettings') && (
          <Link
            to="/settings/reminders"
            className="mt-3 flex min-h-11 items-center justify-center rounded-md border border-border text-sm font-medium text-text hover:bg-bg"
          >
            {t('notifications.delivery.manage')}
          </Link>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <Send size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t('notifications.delivery.note')}
        </p>
      </div>
    </aside>
  );
}

/** RT-3: clinic notifications with tabs, cursor pagination and reminder delivery stats. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<NotificationTab>('all');
  const [extra, setExtra] = useState<{ items: NotificationDto[]; next: string | null } | null>(
    null,
  );
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const unread = useUnreadCount();

  const first = useNotificationsListQuery(
    { unread: tab === 'unread', limit: 30 },
    { pollingInterval: 20_000, skipPollingIfUnfocused: true },
  );
  const [loadMore, loadMoreState] = useLazyNotificationsListQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();

  useEffect(() => {
    setExtra(null);
  }, [tab]);

  const items = useMemo(
    () =>
      mergeById(first.data?.items ?? [], extra?.items ?? [])
        .map((n) => (readIds.has(n.id) ? { ...n, read: true } : n))
        .filter((n) => matchesTab(n, tab)),
    [first.data, extra, readIds, tab],
  );
  const cursor = extra ? extra.next : (first.data?.nextCursor ?? null);

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
        toast.error(
          t(`errors.${asClinicError(error)?.code ?? 'INTERNAL_ERROR'}`, {
            defaultValue: asClinicError(error)?.message ?? '',
          }),
        );
      });
  };

  const onMarkAll = async () => {
    try {
      await markAll().unwrap();
      setReadIds(new Set([...(first.data?.items ?? []), ...(extra?.items ?? [])].map((n) => n.id)));
      toast.success(t('notifications.allRead'));
    } catch (error) {
      toast.error(
        t(`errors.${asClinicError(error)?.code ?? 'INTERNAL_ERROR'}`, {
          defaultValue: asClinicError(error)?.message ?? '',
        }),
      );
    }
  };

  const onLoadMore = async () => {
    if (!cursor) return;
    try {
      const page = await loadMore({ unread: tab === 'unread', cursor, limit: 30 }).unwrap();
      setExtra((current) => ({
        items: mergeById(current?.items ?? [], page.items),
        next: page.nextCursor,
      }));
    } catch (error) {
      toast.error(
        t(`errors.${asClinicError(error)?.code ?? 'INTERNAL_ERROR'}`, {
          defaultValue: asClinicError(error)?.message ?? '',
        }),
      );
    }
  };

  const list = (
    <div>
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
      {first.data && items.length === 0 && (
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
      {items.length > 0 && (
        <ul>
          {items.map((n) => (
            <Item key={n.id} n={n} read={n.read} onRead={onRead} />
          ))}
        </ul>
      )}
      {cursor && items.length > 0 && (
        <div className="border-t border-border p-4 text-center">
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
          <Button
            variant="secondary"
            onClick={() => void onMarkAll()}
            disabled={markAllState.isLoading || unread === 0}
          >
            <CheckCheck size={16} aria-hidden="true" />
            {t('notifications.markAll')}
          </Button>
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
              onChange={(id) => setTab(id as NotificationTab)}
              tabs={[
                { id: 'all', label: t('notifications.tabs.all'), content: list },
                {
                  id: 'unread',
                  label: t('notifications.tabs.unread'),
                  count: unread,
                  content: list,
                },
                { id: 'appointments', label: t('notifications.tabs.appointments'), content: list },
                { id: 'system', label: t('notifications.tabs.system'), content: list },
              ]}
            />
          </div>
        </section>
        <DeliveryCard />
      </div>
    </div>
  );
}
