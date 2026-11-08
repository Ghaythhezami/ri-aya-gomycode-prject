import type { ReactNode } from 'react';
import { Badge } from '../../common/Badge';

/**
 * One settings panel: title, description, draft/saved badge, body and an
 * optional footer for the section's actions. Shared by every section so the
 * cards stay visually identical to the prototype.
 */
export function SettingsCard({
  title,
  description,
  badge,
  badgeTone = 'info',
  children,
  footer,
}: {
  title: string;
  description: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'error' | 'neutral' | 'info';
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-(--shadow-card)">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
      </header>
      <div className="px-4 py-5 sm:px-6">{children}</div>
      {footer ? (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-11 animate-pulse rounded-md bg-bg" />
      ))}
    </div>
  );
}
