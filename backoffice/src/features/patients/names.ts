import {
  DATA_LOCALES,
  normalizeLocalized,
  type DataLocale,
  type LocalizedText,
} from '@riaya/shared';
import { useClinicReferenceQuery } from '../shared/api';

export const EMPTY_LOCALIZED: Required<LocalizedText> = { en: '', fr: '', ar: '' };

/** Form value for a localized name: every language present as a string. */
export function toLocalizedValue(
  i18nValue: LocalizedText | undefined,
  canonical: string,
  defaultLanguage?: DataLocale,
): Required<LocalizedText> {
  const base = { ...EMPTY_LOCALIZED, ...normalizeLocalized(i18nValue) };
  // Old records carry only the canonical column: show it in the clinic default language.
  if (!DATA_LOCALES.some((l) => base[l]) && canonical.trim()) {
    base[defaultLanguage ?? 'en'] = canonical.trim();
  }
  return base;
}

/**
 * Canonical (single-language) name to send: only what the user typed in the clinic default
 * language. Otherwise undefined, and the API derives it from the localized values.
 */
export function canonicalFor(
  value: LocalizedText | undefined,
  defaultLanguage?: DataLocale,
): string | undefined {
  if (!defaultLanguage) return undefined;
  const typed = value?.[defaultLanguage]?.trim();
  return typed ? typed : undefined;
}

/** First non-blank language of a name, used for duplicate checks while typing. */
export function firstFilled(value: LocalizedText | undefined): string {
  for (const l of DATA_LOCALES) {
    const v = value?.[l]?.trim();
    if (v) return v;
  }
  return '';
}

/**
 * The other spellings of a person's full name, e.g. ["Leila Ben Salah", "ليلى بن صالح"].
 * Skips languages whose full name equals (or is contained in) the name already displayed.
 */
export function otherSpellings(
  first: LocalizedText | undefined,
  last: LocalizedText | undefined,
  shown: string,
): string[] {
  const out: string[] = [];
  for (const l of DATA_LOCALES) {
    const full = [first?.[l]?.trim(), last?.[l]?.trim()].filter(Boolean).join(' ');
    if (!full || shown.includes(full) || out.includes(full)) continue;
    out.push(full);
  }
  return out;
}

/** The clinic's default data language, when the reference endpoint exposes it. */
export function useClinicDefaultLanguage(): DataLocale | undefined {
  const { data } = useClinicReferenceQuery();
  const value = (data?.clinic as { defaultLanguage?: string } | undefined)?.defaultLanguage;
  return DATA_LOCALES.find((l) => l === value);
}
