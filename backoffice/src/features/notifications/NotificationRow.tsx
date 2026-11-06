import type { KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { NotificationDto } from '@riaya/shared';
import { entityPath, tileFor } from './templates';
import { useNotificationText } from './useNotificationText';

/** Move focus between rows of the nearest `[data-nlist]` with the arrow keys. */
export function moveRowFocus(event: KeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key) || event.target !== event.currentTarget) return;
  const root = event.currentTarget.closest('[data-nlist]');
  const rows = Array.from(root?.querySelectorAll<HTMLElement>('[data-nrow]') ?? []);
  const at = rows.indexOf(event.currentTarget);
  if (at < 0) return;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)));
  event.preventDefault();
  rows[next]?.focus();
}

/** One notification row: category icon and text, unread marker, open and mark-read actions. */
export function NotificationRow({
  n,
  tabbable,
  onFocusRow,
  onRead,
}: {
  n: NotificationDto;
  tabbable: boolean;
  onFocusRow: (id: string) => void;
  onRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const text = useNotificationText();
  const { Icon, className } = tileFor(n);
  const { title, body } = text.render(n);
  const path = entityPath(n);

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    moveRowFocus(event);
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' && path) {
      if (!n.read) onRead(n.id);
      navigate(path);
    } else if ((event.key === 'm' || event.key === 'M') && !n.read) {
      onRead(n.id);
    }
  };

  return (
    <li
      data-nrow
      tabIndex={tabbable ? 0 : -1}
      onFocus={(event) => event.target === event.currentTarget && onFocusRow(n.id)}
      onKeyDown={onKeyDown}
      className={`flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-border px-4 py-4 outline-offset-[-2px] sm:flex-nowrap sm:px-5 last:border-b-0 ${
        n.read ? '' : 'bg-accent/30'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-10 shrink-0 place-items-center rounded-md ${className}`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
          {title}
          {!n.read && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
              {t('notifications.new')}
            </span>
          )}
        </p>
        {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
        <p className="mt-1 text-xs text-muted">
          {t(`notifications.categories.${n.category}`)} · {text.ago(n.createdAt)}
        </p>
      </div>
      <div className="ms-14 flex shrink-0 items-center gap-1 sm:ms-0">
        {path && (
          <Link
            to={path}
            onClick={() => !n.read && onRead(n.id)}
            className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
          >
            {t('notifications.view')}
          </Link>
        )}
        {!n.read && (
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
