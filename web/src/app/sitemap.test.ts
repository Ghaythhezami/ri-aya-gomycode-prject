import sitemap from './sitemap';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';

describe('sitemap', () => {
  it('lists one entry per locale under the site origin', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual(routing.locales.map((locale) => `${SITE_URL}/${locale}`));
  });

  it('declares every locale and x-default as alternates on each entry', () => {
    for (const entry of sitemap()) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages).sort()).toEqual([...routing.locales, 'x-default'].sort());
      expect(languages['x-default']).toBe(`${SITE_URL}/${routing.defaultLocale}`);
    }
  });
});
