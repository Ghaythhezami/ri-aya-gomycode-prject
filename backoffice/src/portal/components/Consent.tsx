import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** A labelled checkbox/toggle with an explanation below it. */
export function ConsentBox({
  checked,
  onChange,
  title,
  body,
  required = false,
  error,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  body?: string;
  required?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const bodyId = `${id}-body`;
  const errorId = `${id}-error`;
  return (
    <div>
      <div
        className={`flex items-start gap-3 rounded-md border p-3 ${error ? 'border-error' : 'border-border'}`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [body ? bodyId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-text">
            {title}
            {required ? (
              <span className="ms-1 text-muted">({t('portal.common.required')})</span>
            ) : (
              <span className="ms-1 text-muted">({t('portal.common.optional')})</span>
            )}
          </label>
          {body ? (
            <p id={bodyId} className="mt-1 text-sm text-muted">
              {body}
            </p>
          ) : null}
        </div>
      </div>
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm text-error">
          {t(error)}
        </span>
      ) : null}
    </div>
  );
}
