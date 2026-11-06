import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import { routing, type AppLocale } from '@/i18n/routing';
import { JsonLd } from '@/components/JsonLd';
import { OG_LOCALE, SITE_NAME, SITE_URL, languageAlternates } from '@/lib/site';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const noto = Noto_Sans_Arabic({ subsets: ['arabic'], display: 'swap', variable: '--font-noto' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = (await import(`../../../messages/${locale}.json`)).default as {
    meta: { title: string; description: string };
  };
  const { title, description } = messages.meta;
  const url = `${SITE_URL}/${locale}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    applicationName: SITE_NAME,
    alternates: { canonical: `/${locale}`, languages: languageAlternates() },
    openGraph: {
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[locale] ?? 'en_US',
      alternateLocale: Object.values(OG_LOCALE).filter((l) => l !== OG_LOCALE[locale]),
      type: 'website',
      url,
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as AppLocale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const messagesMeta = (messages as { meta: { description: string } }).meta;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${noto.variable}`}>
      <body className="antialiased">
        <JsonLd locale={locale} description={messagesMeta.description} />
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
