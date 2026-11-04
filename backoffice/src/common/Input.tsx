import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The shared control shell: `min-h-10` (40px) satisfies the NFR-002 interactive
 * target floor, and the focus ring is drawn by the global `*:focus-visible` rule.
 */
const CONTROL =
  'min-h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-text placeholder:text-muted aria-[invalid=true]:border-error';

export function Input({
  className = '',
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input aria-invalid={invalid || undefined} className={`${CONTROL} ${className}`} {...props} />
  );
}

export function Textarea({
  className = '',
  invalid,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      rows={rows}
      className={`${CONTROL} py-2 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select aria-invalid={invalid || undefined} className={`${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * Labels a control and owns its help/error text.
 *
 * The description ids are generated here and injected into the single child
 * control via `cloneElement`, so a caller cannot ship a field whose error message
 * is visible but unannounced. Passing `id` to the child is respected.
 */
export function Field({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const reactId = useId();
  const helpId = `${reactId}-help`;
  const errorId = `${reactId}-error`;

  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  const control = Children.only(children);
  const child = isValidElement(control)
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })
    : control;

  return (
    <div className="block">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
        {child}
      </label>
      {help ? (
        <span id={helpId} className="mt-1 block text-sm text-muted">
          {help}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm text-error">
          {/* Shared schemas emit i18n keys; a literal server message falls through unchanged. */}
          {t(error)}
        </span>
      ) : null}
    </div>
  );
}
