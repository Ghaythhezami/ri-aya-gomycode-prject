import { DATA_LOCALES, type DataLocale } from '@riaya/shared';

/** First supported tag (en, ar, fr) of an Accept-Language header, or null. */
export function parseAcceptLanguage(
  header: string | string[] | undefined | null,
): DataLocale | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  for (const part of raw.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if ((DATA_LOCALES as readonly string[]).includes(tag)) return tag as DataLocale;
  }
  return null;
}
