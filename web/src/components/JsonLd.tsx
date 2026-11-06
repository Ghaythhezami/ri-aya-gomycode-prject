import { APP_URL, SITE_NAME, SITE_URL } from '@/lib/site';

/** Server-rendered structured data: Organization + SoftwareApplication (no ratings or prices). */
export function JsonLd({ locale, description }: { locale: string; description: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: SITE_NAME,
        description,
        inLanguage: ['en', 'ar', 'fr'],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: `${SITE_URL}/${locale}`,
        installUrl: APP_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // `<` escaped so content can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }}
    />
  );
}
