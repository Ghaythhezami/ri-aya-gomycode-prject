import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A heading block used at the top of every portal page. */
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li' | 'article';
  'aria-labelledby'?: string;
}) {
  return (
    <Tag
      className={`rounded-lg border border-border bg-surface p-4 shadow-(--shadow-card) sm:p-5 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

const NOTICE_TONES = {
  error: { box: 'border-error/40 bg-error/10 text-error', glyph: '✕', role: 'alert' },
  info: { box: 'border-border bg-accent text-text', glyph: 'i', role: 'status' },
  success: { box: 'border-success/40 bg-success/10 text-success', glyph: '✓', role: 'status' },
  warning: { box: 'border-warning/40 bg-warning/10 text-warning', glyph: '!', role: 'status' },
} as const;

/** Inline message. The glyph and role carry meaning, so tone is never colour alone. */
export function Notice({
  tone = 'info',
  children,
  id,
}: {
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
  id?: string;
}) {
  const { box, glyph, role } = NOTICE_TONES[tone];
  return (
    <div
      id={id}
      role={role}
      className={`flex items-start gap-2 rounded-md border p-3 text-sm ${box}`}
    >
      <span aria-hidden className="mt-px font-semibold">
        {glyph}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A link styled like the shared Button (Button itself renders a <button>). */
export function ButtonLink({
  to,
  children,
  variant = 'primary',
  className = '',
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const styles = {
    primary: 'bg-primary text-white hover:bg-primary-dark',
    secondary: 'border border-border bg-surface text-text hover:bg-bg',
    ghost: 'text-primary hover:bg-accent',
  }[variant];
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-48 place-items-center" role="status" aria-busy="true">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Initials({ value }: { value: string }) {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-primary"
    >
      {value}
    </span>
  );
}
