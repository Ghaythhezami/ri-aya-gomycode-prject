'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { links, sections } from '@/lib/links';
import { BrandLogo } from './BrandLogo';

export function Header() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      if (window.scrollY < 200) setActive(null);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? 'border-b border-white/70 bg-white/80 shadow-[0_8px_30px_-12px_rgba(21,40,63,0.15)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Ri’aya" onClick={() => setOpen(false)}>
          <BrandLogo />
        </Link>

        <nav
          aria-label={t('main')}
          className="hidden items-center gap-1 rounded-full border border-white/80 bg-white/60 p-1 shadow-[0_4px_18px_-10px_rgba(21,40,63,0.2)] backdrop-blur lg:flex"
        >
          {sections.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                active === id
                  ? 'bg-white text-primary shadow-[0_2px_10px_-4px_rgba(15,118,110,0.35)]'
                  : 'text-muted hover:text-navy'
              }`}
            >
              {t(id)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LocaleSwitch />
          <a
            href={links.signIn}
            className="inline-flex h-11 items-center rounded-[14px] px-4 text-sm font-semibold text-navy transition hover:bg-white/80 hover:text-primary"
          >
            {t('signIn')}
          </a>
          <a
            href={links.signUp}
            className="btn-brand group inline-flex h-11 items-center gap-2 rounded-[14px] px-5 text-sm font-semibold text-white"
          >
            {t('getStarted')}
            <ArrowRight
              size={16}
              className="rtl-flip transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
            />
          </a>
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-[14px] border border-border bg-white/80 text-navy lg:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? t('close') : t('menu')}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open ? (
        <div
          id="mobile-menu"
          className="h-[calc(100dvh-76px)] overflow-y-auto border-t border-border/70 bg-white/95 px-4 pt-4 pb-8 backdrop-blur-xl sm:px-6 lg:hidden"
        >
          <nav aria-label={t('main')} className="flex flex-col">
            {sections.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-14 items-center justify-between border-b border-border/70 text-lg font-semibold text-navy"
              >
                {t(id)}
                <ArrowRight size={18} className="rtl-flip text-primary" />
              </a>
            ))}
          </nav>
          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-muted uppercase">
              {t('language')}
            </p>
            <LocaleSwitch />
          </div>
          <div className="mt-8 grid gap-3">
            <a
              href={links.signUp}
              className="btn-brand inline-flex h-13 items-center justify-center gap-2 rounded-[14px] font-semibold text-white"
            >
              {t('getStarted')}
              <ArrowRight size={18} className="rtl-flip" />
            </a>
            <a
              href={links.signIn}
              className="inline-flex h-13 items-center justify-center rounded-[14px] border border-border bg-white font-semibold text-navy"
            >
              {t('signIn')}
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function LocaleSwitch() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div
      className="flex w-fit shrink-0 rounded-full border border-border bg-white p-1"
      role="group"
      aria-label={t('language')}
    >
      {routing.locales.map((item) => (
        <Link
          key={item}
          href={pathname}
          locale={item}
          aria-current={locale === item ? 'true' : undefined}
          className={`grid min-h-8 min-w-10 place-items-center rounded-full px-2 text-xs font-semibold uppercase transition ${
            locale === item ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          {item}
        </Link>
      ))}
    </div>
  );
}
