import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';

// Single public page per locale today; add paths here as marketing pages are added.
const PAGES = [''];
const lastModified = new Date(process.env.SITE_LAST_MODIFIED ?? '2026-11-06');

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((page) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${page}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: page === '' ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${page}`])),
          'x-default': `${SITE_URL}/${routing.defaultLocale}${page}`,
        },
      },
    })),
  );
}
