import { AsyncLocalStorage } from 'node:async_hooks';
import { DATA_LOCALES, type DataLocale } from '@riaya/shared';

interface LocaleFrame {
  locale: DataLocale | null;
}

const storage = new AsyncLocalStorage<LocaleFrame>();

/** First supported language of an `Accept-Language` header (q-values respected), else null. */
export function parseAcceptLanguage(header: string | string[] | undefined): DataLocale | null {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return null;
  const tags = raw
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
      return { tag: (tag ?? '').trim().toLowerCase(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((t) => t.tag && t.tag !== '*' && t.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of tags) {
    const primary = tag.split('-')[0] as DataLocale;
    if ((DATA_LOCALES as readonly string[]).includes(primary)) return primary;
  }
  return null;
}

/**
 * The language of the current request (from `Accept-Language`), readable anywhere below the
 * middleware without threading it through every call. Outside a request it is null.
 */
export const RequestLocale = {
  run<T>(locale: DataLocale | null, fn: () => T): T {
    return storage.run({ locale }, fn);
  },
  get(): DataLocale | null {
    return storage.getStore()?.locale ?? null;
  },
};
