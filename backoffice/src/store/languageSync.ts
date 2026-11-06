import type { i18n as I18n } from 'i18next';
import { DATA_LOCALES, type DataLocale } from '@riaya/shared';

interface LanguageSyncDeps {
  i18n: Pick<I18n, 'on' | 'off' | 'language'>;
  /** Drops cached server data so it is fetched again with the new Accept-Language. */
  resetCache: () => void;
  /** Reloads the signed-in user (names and role name are localized by the API). */
  refreshUser: () => void;
  isSignedIn: () => boolean;
  /** Stored preferred locale of the signed-in user, to skip redundant writes. */
  storedLocale: () => string | undefined;
  persist: (locale: DataLocale) => Promise<unknown>;
}

/**
 * Stored data follows the UI language (ADR 0004 section 3). The axios client reads
 * `i18n.language` for `Accept-Language` on each request, so a language change only needs
 * to drop the RTK Query cache, reload the user, and remember the choice on the profile.
 * Returns the unsubscribe function.
 */
export function installLanguageSync(deps: LanguageSyncDeps): () => void {
  const handler = (lng: string) => {
    deps.resetCache();
    if (!deps.isSignedIn()) return;
    deps.refreshUser();
    const locale = lng.slice(0, 2) as DataLocale;
    if (DATA_LOCALES.includes(locale) && deps.storedLocale() !== locale) {
      void deps.persist(locale).catch(() => undefined);
    }
  };
  deps.i18n.on('languageChanged', handler);
  return () => deps.i18n.off('languageChanged', handler);
}
