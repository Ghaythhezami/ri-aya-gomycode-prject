import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Check } from 'lucide-react';
import { Popover } from '../../common/Popover';
import { Skeleton } from '../../common/Skeleton';
import { useMarkNotificationReadMutation, useNotificationsListQuery } from './api';
import { entityPath, tileFor } from './templates';
import { useNotificationText } from './useNotificationText';
import { useUnreadCount } from './useUnreadCount';

function BellPanel() {
  const { t } = useTranslation();
  const text = useNotificationText();
  const { data, isLoading, isError, refetch } = useNotificationsListQuery(
    { limit: 5 },
    { pollingInterval: 20_000, skipPollingIfUnfocused: true },
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [localRead, setLocalRead] = useState<Set<string>>(() => new Set());

  return (
    <div className="-m-1 w-[min(20rem,calc(100vw-3rem))]">
      <div className="flex items-center justify-between px-2 pb-2">
        <h2 className="text-sm font-semibold text-text">{t('notifications.title')}</h2>
        <Link to="/notifications" className="text-xs font-medium text-primary hover:underline">
          {t('clinic.viewAll')}
        </Link>
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
      {data && data.items.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted">
          {t('notifications.empty.all.title')}
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul className="max-h-80 overflow-y-auto">
          {data.items.map((n) => {
            const { Icon, className } = tileFor(n);
            const { title, body } = text.render(n);
            const read = n.read || localRead.has(n.id);
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
                    className={`block truncate text-sm ${read ? 'text-text' : 'font-semibold text-text'}`}
                  >
                    {title}
                  </span>
                  {body && <span className="block truncate text-xs text-muted">{body}</span>}
                  <span className="block text-xs text-muted">{text.ago(n.createdAt)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id} className="flex items-start gap-1 rounded-md py-1.5 hover:bg-bg">
                {path ? (
                  <Link
                    to={path}
                    onClick={() => {
                      if (!read) void markRead(n.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 px-1"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-2 px-1">{content}</div>
                )}
                {!read && (
                  <button
                    type="button"
                    aria-label={t('notifications.markRead')}
                    title={t('notifications.markRead')}
                    onClick={() => {
                      setLocalRead((s) => new Set(s).add(n.id));
                      void markRead(n.id);
                    }}
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

/** Top-bar bell: unread badge and a popover with the latest five notifications. */
export function NotificationBell() {
  const { t } = useTranslation();
  const count = useUnreadCount();
  const location = useLocation();
  const shown = count > 99 ? '99+' : String(count);

  return (
    // Remounting on navigation closes the popover after following one of its links.
    <Popover
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
              {shown}
            </span>
          )}
          <span className="sr-only" aria-live="polite">
            {t('notifications.unreadLive', { count })}
          </span>
        </button>
      )}
    >
      <BellPanel />
    </Popover>
  );
}
