import { useId, type ChangeEvent } from 'react';

/**
 * Date and time inputs.
 *
 * The stored value is always the native control's ISO form (`yyyy-mm-dd`,
 * `hh:mm`), which is locale-independent, so it can be sent to the API untouched.
 * Only the *presentation* is localised, via `Intl` (FR-010): the browser renders
 * a native picker in the user's locale while `value`/`onChange` stay stable.
 *
 * `Intl` is used for the human-readable echo beneath the field, which gives an
 * unambiguous confirmation in the active locale instead of relying on the
 * control's own date-order rendering.
 */

const CONTROL =
  'min-h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-text aria-[invalid=true]:border-error';

function formatDate(value: string, locale: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function formatTime(value: string, locale: string): string {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '';
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function DatePicker({
  value,
  onChange,
  label,
  locale,
  min,
  max,
  invalid,
  id,
}: {
  /** ISO `yyyy-mm-dd`, or '' when empty. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** BCP-47 tag used only for the readable echo. */
  locale?: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  id?: string;
}) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const lang = locale ?? document.documentElement.lang ?? 'en';
  const echo = formatDate(value, lang);

  return (
    <div className="block">
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-text">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        type="date"
        dir="ltr"
        value={value}
        min={min}
        max={max}
        aria-invalid={invalid || undefined}
        className={CONTROL}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {echo ? (
        <span className="mt-1 block text-sm text-muted" aria-live="polite">
          {echo}
        </span>
      ) : null}
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  label,
  locale,
  step,
  invalid,
  id,
}: {
  /** ISO `hh:mm` (24-hour), or '' when empty. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  locale?: string;
  /** Granularity in seconds, passed through to the native control. */
  step?: number;
  invalid?: boolean;
  id?: string;
}) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const lang = locale ?? document.documentElement.lang ?? 'en';
  const echo = formatTime(value, lang);

  return (
    <div className="block">
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-text">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        type="time"
        dir="ltr"
        value={value}
        step={step}
        aria-invalid={invalid || undefined}
        className={CONTROL}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {echo ? (
        <span className="mt-1 block text-sm text-muted" aria-live="polite">
          {echo}
        </span>
      ) : null}
    </div>
  );
}
