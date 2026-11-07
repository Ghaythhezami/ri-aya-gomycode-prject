import { routing } from '@/i18n/routing';

const trim = (value: string) => value.replace(/\/$/, '');

/** Public origin of this landing site (canonical URLs, sitemap, Open Graph). */
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://riaya-xi.vercel.app');

/** Origin of the staff workspace (separate Vite SPA project). */
export const APP_URL = trim(process.env.NEXT_PUBLIC_APP_URL ?? 'https://riaya-app.vercel.app');

/** Patient portal entry points (served by the staff workspace SPA under `/portal`). */
export function portalUrl(path: 'register' | 'login' = 'register', base: string = APP_URL): string {
  return `${trim(base)}/portal/${path}`;
}

export const SITE_NAME = "RI'AYA";

export const OG_LOCALE: Record<string, string> = { en: 'en_US', ar: 'ar_AR', fr: 'fr_FR' };

/** hreflang alternates (relative to metadataBase) including x-default. */
export function languageAlternates(): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    'x-default': `/${routing.defaultLocale}`,
  };
}
