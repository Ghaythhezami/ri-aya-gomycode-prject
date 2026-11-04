import type { ReactNode } from 'react';

/**
 * Empty and error states as one pair (FR-004), so a screen never ships a blank
 * region or an unstyled failure. Both are announced politely and expose a single
 * recovery action, which keeps the next step obvious.
 */

function Shell({
  tone,
  icon,
  title,
  description,
  action,
}: {
  tone: 'neutral' | 'error';
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const accent = tone === 'error' ? 'bg-error/10 text-error' : 'bg-accent text-primary';
  return (
    <div
      role="status"
      className="flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-10 text-center"
    >
      <span
        aria-hidden
        className={`grid size-10 place-items-center rounded-full text-lg ${accent}`}
      >
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-text">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '—',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Shell tone="neutral" icon={icon} title={title} description={description} action={action} />
  );
}

export function ErrorState({
  title,
  description,
  action,
  icon = '!',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div role="alert">
      <Shell tone="error" icon={icon} title={title} description={description} action={action} />
    </div>
  );
}
