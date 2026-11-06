import { DATA_LOCALES, pickLocalized, type LocalizedText } from '@riaya/shared';

export const MAX_APPOINTMENT_TYPES = 50;
export const MIN_TYPE_MINUTES = 5;
export const MAX_TYPE_MINUTES = 480;
export const TYPE_CODE_MAX = 32;

/**
 * Code of a custom type from its name: English when present, else the first filled language,
 * upper-cased to A-Z, 0-9 and underscore, at most 32 characters. Empty when nothing usable
 * remains (for example an Arabic-only name), so the caller can fall back to a generic code.
 */
export function slugCode(name: LocalizedText): string {
  const source = name.en?.trim() || DATA_LOCALES.map((l) => name[l]?.trim()).find(Boolean) || '';
  return normalizeCode(
    source
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_'),
  );
}

/** Upper-case, restrict to A-Z0-9_, trim underscores and cap at 32 characters. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, TYPE_CODE_MAX)
    .replace(/_+$/g, '');
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9_]{1,32}$/.test(code);
}

export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_TYPE_MINUTES &&
    minutes <= MAX_TYPE_MINUTES &&
    minutes % 5 === 0
  );
}

/** First supported language tag of an Accept-Language header (`fr-FR,fr;q=0.9` becomes `fr`). */
export function parseAcceptLanguage(header: string | undefined | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (tag && (DATA_LOCALES as readonly string[]).includes(tag)) return tag;
  }
  return undefined;
}

/** Name for the request language, then the clinic default, then any language, then the code. */
export function typeDisplayName(
  name: LocalizedText,
  code: string,
  locale?: string | null,
  defaultLocale?: string | null,
): string {
  return pickLocalized(name, locale, code, defaultLocale);
}
