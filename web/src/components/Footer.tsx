import { useTranslations } from 'next-intl';
import { ArrowUp, Globe, HeartPulse } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { links } from '@/lib/links';
import { BrandLogo } from './BrandLogo';

const localeNames = { en: 'English', ar: 'العربية', fr: 'Français' } as const;

export function Footer() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');

  const columns = [
    {
      title: t('product'),
      items: [
        { label: nav('platform'), href: '#platform' },
        { label: nav('how'), href: '#how' },
        { label: nav('roles'), href: '#roles' },
        { label: nav('security'), href: '#security' },
      ],
    },
    {
      title: t('workspace'),
      items: [
        { label: nav('signIn'), href: links.signIn },
        { label: t('createAccount'), href: links.signUp },
        { label: t('designSystem'), href: links.designSystem },
      ],
    },
    {
      title: t('legal'),
      items: [
        { label: t('privacy'), href: undefined },
        { label: t('terms'), href: undefined },
      ],
    },
  ];

  return (
    <footer className="relative overflow-hidden bg-navy text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-40 h-[420px] w-[420px] rounded-full bg-teal/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -start-32 h-[420px] w-[420px] rounded-full bg-blue/25 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <BrandLogo tone="light" />
            <p className="mt-5 leading-relaxed text-white/65">{t('blurb')}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Globe size={16} className="text-white/50" />
              {routing.locales.map((item) => (
                <Link
                  key={item}
                  href="/"
                  locale={item}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/75 transition hover:border-white/40 hover:text-white"
                >
                  {localeNames[item]}
                </Link>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold tracking-[0.16em] text-[#7fdccc] uppercase">
                {column.title}
              </p>
              <ul className="mt-5 space-y-3">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-sm text-white/70 transition hover:text-white"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span className="text-sm text-white/45">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-8 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('rights')}</p>
          <p className="inline-flex items-center gap-2">
            <HeartPulse size={16} className="text-[#7fdccc]" />
            {t('madeWith')}
          </p>
          <a
            href="#top"
            className="inline-flex items-center gap-2 font-medium text-white/75 transition hover:text-white"
          >
            {t('backToTop')}
            <ArrowUp size={16} />
          </a>
        </div>
      </div>
    </footer>
  );
}
