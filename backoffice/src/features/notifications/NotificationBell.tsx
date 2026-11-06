import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import type { NotificationDto } from '@riaya/shared';
import { Popover } from '../../common/Popover';
import { Skeleton } from '../../common/Skeleton';
import { useAdaptivePolling } from '../../lib/realtime';
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsListQuery,
} from './api';
import { badgeText, isHighPriority } from './liveLogic';
import { entityPath, tileFor } from './templates';
import { useNotificationRealtimeSync } from './useNotificationRealtimeSync';
import { useNotificationText } from './useNotificationText';
import { UNREAD_POLL_LIVE_MS, UNREAD_POLL_MS, useUnreadCount } from './useUnreadCount';

/** Latest notifications shown in the dropdown. */
export const BELL_LIMIT = 6;
const ALERT_MS = 8000;

function BellPanel({ unread }: { unread: number }) {
  const { t } = useTranslation();
  const text = useNotificationText();
  const pollingInterval = useAdaptivePolling(UNREAD_POLL_MS, UNREAD_POLL_LIVE_MS);
  const { data, isLoading, isError, refetch } = useNotificationsListQuery(
    { limit: BELL_LIMIT },
    { pollingInterval, skipPollingIfUnfocused: true },
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
  const items = (data?.items ?? []).slice(0, BELL_LIMIT);

  return (
    <div className="-m-1 w-[min(20rem,calc(100vw-3rem))]">
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <h2 className="text-sm font-semibold text-text">{t('notifications.title')}</h2>
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={unread === 0 || markAllState.isLoading}
          className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent disabled:opacity-50"
        >
          <CheckCheck size={14} aria-hidden="true" />
          {t('notifications.markAll')}
        </button>
      </div>
      {isLoading && <Skeleton className="h-32" />}
      {isError && !data && (
        <p role="alert" className="px-2 py-3 text-sm text-error">
          {t('notifications.loadError')}{' '}
          <button type="button" className="font-medium underline" onClick={() => void refetch()}>
            {t('clinic.retry')}
          </button>
        </p>
      )}
      {data && items.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted">
          {t('notifications.empty.all.title')}
        </p>
      )}
      {items.length > 0 && (
        <ul className="max-h-80 overflow-y-auto">
          {items.map((n) => {
            const { Icon, className } = tileFor(n);
            const { title, body } = text.render(n);
            const path = entityPath(n);
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={`grid size-8 shrink-0 place-items-center rounded-md ${className}`}
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-start">
                  <span
                    className={`block truncate text-sm ${n.read ? 'text-text' : 'font-semibold text-text'}`}
                  >
                    {!n.read && (
                      <>
                        <span
                          aria-hidden="true"
                          className="me-1.5 inline-block size-2 rounded-full bg-primary align-middle"
                        />
                        <span className="sr-only">{t('notifications.unreadItem')}</span>
                      </>
                    )}
                    {title}
                  </span>
                  {body && <span className="block truncate text-xs text-muted">{body}</span>}
                  <span className="block text-xs text-muted">
                    {t(`notifications.categories.${n.category}`)} · {text.ago(n.createdAt)}
                  </span>
                </span>
              </>
            );
            return (
              <li key={n.id} className="flex items-start gap-1 rounded-md py-1.5 hover:bg-bg">
                {path ? (
                  <Link
                    to={path}
                    onClick={() => {
                      if (!n.read) void markRead(n.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 px-1"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-2 px-1">{content}</div>
                )}
                {!n.read && (
                  <button
                    type="button"
                    aria-label={t('notifications.markRead')}
                    title={t('notifications.markRead')}
                    onClick={() => void markRead(n.id)}
                    className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-accent hover:text-primary"
                  >
                    <Check size={15} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to="/notifications"
        className="mt-2 flex min-h-10 items-center justify-center rounded-md border border-border text-sm font-medium text-text hover:bg-bg"
      >
        {t('notifications.viewAll')}
      </Link>
    </div>
  );
}

/** Toast for a new high-priority notification, with an action to open it. */
function AlertToast({ n, onClose }: { n: NotificationDto; onClose: () => void }) {
  const { t } = useTranslation();
  const text = useNotificationText();
  const { Icon } = tileFor(n);
  const { title, body } = text.render(n);
  const path = entityPath(n) ?? '/notifications';

  useEffect(() => {
    const id = window.setTimeout(onClose, ALERT_MS);
    return () => window.clearTimeout(id);
  }, [n.id, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm shadow-(--shadow-overlay)"
      >
        <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">
            <span className="text-error">{t(`notifications.categories.${n.category}`)}</span>
            {' · '}
            {title}
          </p>
          {body && <p className="mt-0.5 text-muted">{body}</p>}
          <Link
            to={path}
            onClick={onClose}
            className="mt-2 inline-flex min-h-10 items-center rounded-md border border-border px-3 font-medium text-primary hover:bg-accent"
          >
            {t('notifications.view')}
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('clinic.close')}
          className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-accent"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Top-bar bell: live unread badge and a popover with the latest notifications. */
export function NotificationBell() {
  const { t } = useTranslation();
  const count = useUnreadCount();
  const location = useLocation();
  const [alert, setAlert] = useState<NotificationDto | null>(null);
  const closeAlert = useCallback(() => setAlert(null), []);
  useNotificationRealtimeSync((n) => {
    if (isHighPriority(n)) setAlert(n);
  });

  return (
    <>
      <Popover
        // Remounting on navigation closes the popover after following one of its links.
        key={location.pathname}
        label={t('notifications.title')}
        preferredAlign="end"
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('notifications.bell', { count })}
            className="relative grid size-10 place-items-center rounded-md text-text hover:bg-accent"
          >
            <Bell size={20} aria-hidden="true" />
            {count > 0 && (
              <span
                aria-hidden="true"
                className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-error px-1 text-[11px] font-semibold leading-5 text-white"
              >
                {badgeText(count)}
              </span>
            )}
          </button>
        )}
      >
        <BellPanel unread={count} />
      </Popover>
      <span className="sr-only" role="status" aria-live="polite">
        {t('notifications.unreadLive', { count })}
      </span>
      {alert && <AlertToast n={alert} onClose={closeAlert} />}
    </>
  );
}
