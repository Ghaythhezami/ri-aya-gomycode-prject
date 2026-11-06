import { BadRequestException } from '@nestjs/common';
import {
  DATA_LOCALES,
  normalizeLocalized,
  type DataLocale,
  type LocalizedText,
} from '@riaya/shared';

/** Canonical single-language value: the clinic default language's value, else the first filled. */
export function canonicalFrom(
  i18n: LocalizedText,
  defaultLocale?: string | null,
): string | undefined {
  const order = [defaultLocale, ...DATA_LOCALES].filter(Boolean) as DataLocale[];
  for (const locale of order) {
    const v = i18n[locale]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Resolves a name field from the canonical value and/or its per-language values.
 * A provided canonical value is kept; otherwise it is derived. At least one is required.
 */
export function resolveNameInput(
  field: string,
  canonical: string | undefined,
  i18nInput: unknown,
  defaultLocale?: string | null,
): { canonical: string; i18n: LocalizedText } {
  const i18n = normalizeLocalized(i18nInput);
  const given = canonical?.trim();
  const value = given || canonicalFrom(i18n, defaultLocale);
  if (!value) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${field} is required in at least one language`,
      details: { field },
    });
  }
  return { canonical: value, i18n };
}

/** Lower-cased haystack for `patients.searchText` (canonical + every language, code, phone, email). */
export function buildSearchText(parts: Array<string | null | undefined | LocalizedText>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') out.push(part);
    else out.push(...DATA_LOCALES.map((l) => part[l] ?? ''));
  }
  return out
    .map((v) => v.trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Escapes `%`, `_` and `\` for use inside an ILIKE pattern. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
