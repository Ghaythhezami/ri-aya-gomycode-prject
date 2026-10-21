import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return routing.locales.map((locale) => ({
    url: `${site}/${locale}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1,
  }));
}
