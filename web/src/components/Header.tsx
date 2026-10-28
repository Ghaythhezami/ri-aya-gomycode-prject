'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { BrandLogo } from './BrandLogo';

const workspace = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? 'http://localhost:5173';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-4 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo className="h-12 w-12" />
          <span className="text-lg font-semibold tracking-tight text-navy">RI&apos;AYA</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
          <a href="#platform">{t('platform')}</a>
          <a href="#solutions">{t('solutions')}</a>
          <a href="#security">{t('security')}</a>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex rounded-full border border-border p-1">
            {routing.locales.map((item) => (
              <Link
                key={item}
                href={pathname}
                locale={item}
                className={`min-h-8 min-w-10 rounded-full px-2 text-center text-xs font-semibold uppercase ${
                  locale === item ? 'bg-navy text-white' : 'text-muted'
                }`}
              >
                {item}
              </Link>
            ))}
          </div>
          <a
            href={`${workspace}/login`}
            className="inline-flex min-h-11 items-center rounded-[12px] px-4 text-sm font-medium text-text"
          >
            {t('signIn')}
          </a>
          <a
            href={workspace}
            className="inline-flex min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-white shadow-sm"
          >
            {t('openWorkspace')}
          </a>
        </div>
        <button
          className="grid size-11 place-items-center rounded-[12px] border border-border md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? t('close') : t('menu')}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-4 md:hidden">
          <a className="block min-h-11 py-2" href="#platform">
            {t('platform')}
          </a>
          <a className="block min-h-11 py-2" href="#solutions">
            {t('solutions')}
          </a>
          <a className="block min-h-11 py-2" href="#security">
            {t('security')}
          </a>
          <div className="flex gap-2">
            {routing.locales.map((item) => (
              <Link
                key={item}
                href={pathname}
                locale={item}
                className={`min-h-10 min-w-10 rounded-full border px-3 text-xs font-semibold uppercase ${
                  locale === item ? 'border-navy bg-navy text-white' : 'border-border'
                }`}
              >
                {item}
              </Link>
            ))}
          </div>
          <a className="block min-h-11 py-2" href={`${workspace}/login`}>
            {t('signIn')}
          </a>
          <a
            className="inline-flex min-h-11 items-center rounded-[12px] bg-primary px-4 text-white"
            href={workspace}
          >
            {t('openWorkspace')}
          </a>
        </div>
      ) : null}
    </header>
  );
}
