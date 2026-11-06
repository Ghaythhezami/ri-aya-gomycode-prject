import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DATA_LOCALES,
  LOCALIZED_NAME_MAX,
  type DataLocale,
  type LocalizedText,
} from '@riaya/shared';

const DIR: Record<DataLocale, 'ltr' | 'rtl'> = { en: 'ltr', fr: 'ltr', ar: 'rtl' };

const CONTROL =
  'min-h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-text placeholder:text-muted aria-[invalid=true]:border-error';

/**
 * One value entered in English, French and Arabic (ADR 0004 §3). Renders a fieldset with
 * one input per language — the Arabic input is right-to-left whatever the UI direction —
 * and marks the language the UI currently shows. At least one language is usually required;
 * the API derives the canonical value from the clinic default language.
 */
export function LocalizedInput({
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required = false,
  maxLength = LOCALIZED_NAME_MAX,
  autoComplete,
  disabled = false,
  name,
}: {
  label: string;
  value: LocalizedText | null | undefined;
  onChange: (next: LocalizedText) => void;
  onBlur?: () => void;
  /** An i18n key or a literal message. */
  error?: string;
  help?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  /** Base name for the inputs (`<name>.en` …), for tests and form libraries. */
  name?: string;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <fieldset className="min-w-0" aria-describedby={describedBy || undefined}>
      <legend className="mb-1.5 text-sm font-medium text-text">
        {label}
        {required ? (
          <span className="ms-1 text-muted" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {DATA_LOCALES.map((locale) => {
          const inputId = `${id}-${locale}`;
          return (
            <div key={locale} className="min-w-0">
              <label
                htmlFor={inputId}
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted"
              >
                <span lang={locale}>{t(`localized.languages.${locale}`)}</span>
                {locale === current ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {t('localized.current')}
                  </span>
                ) : null}
              </label>
              <input
                id={inputId}
                name={name ? `${name}.${locale}` : undefined}
                lang={locale}
                dir={DIR[locale]}
                value={value?.[locale] ?? ''}
                maxLength={maxLength}
                autoComplete={locale === 'en' ? autoComplete : 'off'}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                onBlur={onBlur}
                onChange={(e) => onChange({ ...(value ?? {}), [locale]: e.target.value })}
                className={`${CONTROL} text-start`}
              />
            </div>
          );
        })}
      </div>
      {help ? (
        <span id={helpId} className="mt-1 block text-sm text-muted">
          {help}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm text-error">
          {t(error)}
        </span>
      ) : null}
    </fieldset>
  );
}

/** True when at least one language has a non-blank value. */
export function isLocalizedFilled(value: LocalizedText | null | undefined): boolean {
  return DATA_LOCALES.some((l) => Boolean(value?.[l]?.trim()));
}
