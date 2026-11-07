import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DATA_LOCALES,
  LOCALIZED_NAME_MAX,
  type DataLocale,
  type LocalizedText,
} from '@riaya/shared';

const CONTROL =
  'min-h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-text placeholder:text-muted aria-[invalid=true]:border-error';

/** One input of the fieldset: which stored languages it reads and writes. */
interface Slot {
  key: string;
  /** Languages written on change; the first non-blank one is shown. */
  locales: DataLocale[];
  dir: 'ltr' | 'rtl';
  lang: string;
  label: string;
}

/**
 * One value entered per script or per language (ADR 0004 §3).
 *
 * - `mode="script"` (default, for names of people): two inputs, Latin letters (stored for
 *   English and French, which spell names the same) and Arabic letters.
 * - `mode="languages"` (for labels that are real words, e.g. appointment types, roles): one
 *   input per language, English, French and Arabic.
 *
 * The Arabic input is right-to-left whatever the UI direction, and the input the UI currently
 * shows is marked. The API derives the canonical value from the clinic default language.
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
  mode = 'script',
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
  /** Base name for the inputs (`<name>.latin`, `<name>.en` …), for tests and form libraries. */
  name?: string;
  mode?: 'script' | 'languages';
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2) as DataLocale;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  const slots: Slot[] =
    mode === 'script'
      ? [
          {
            key: 'latin',
            locales: ['en', 'fr'],
            dir: 'ltr',
            lang: 'en',
            label: t('localized.scripts.latin'),
          },
          {
            key: 'arabic',
            locales: ['ar'],
            dir: 'rtl',
            lang: 'ar',
            label: t('localized.scripts.arabic'),
          },
        ]
      : DATA_LOCALES.map((locale) => ({
          key: locale,
          locales: [locale],
          dir: locale === 'ar' ? 'rtl' : 'ltr',
          lang: locale,
          label: t(`localized.languages.${locale}`),
        }));

  const read = (slot: Slot) =>
    slot.locales.map((l) => value?.[l] ?? '').find((v) => v.trim()) ??
    value?.[slot.locales[0]!] ??
    '';

  const write = (slot: Slot, text: string) => {
    const next: LocalizedText = { ...(value ?? {}) };
    for (const l of slot.locales) next[l] = text;
    onChange(next);
  };

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
      <div className={`grid gap-2 ${slots.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        {slots.map((slot) => {
          const inputId = `${id}-${slot.key}`;
          return (
            <div key={slot.key} className="min-w-0">
              <label
                htmlFor={inputId}
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted"
              >
                <span>{slot.label}</span>
                {slot.locales.includes(current) ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {t('localized.current')}
                  </span>
                ) : null}
              </label>
              <input
                id={inputId}
                name={name ? `${name}.${slot.key}` : undefined}
                lang={slot.lang}
                dir={slot.dir}
                value={read(slot)}
                maxLength={maxLength}
                autoComplete={slot.key === 'latin' || slot.key === 'en' ? autoComplete : 'off'}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                onBlur={onBlur}
                onChange={(e) => write(slot, e.target.value)}
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
