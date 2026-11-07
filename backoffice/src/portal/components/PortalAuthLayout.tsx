import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../layouts/LanguageSwitcher';

/** Centered, mobile-first card for sign-in, sign-up and invite pages. */
export function PortalAuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const logo = `${import.meta.env.BASE_URL}logo.png`;
  return (
    <div className="relative min-h-dvh overflow-hidden bg-linear-to-br from-accent/60 via-bg to-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -start-40 size-[32rem] rounded-full bg-primary/10 blur-3xl"
      />
      <main
        id="portal-main"
        className={`relative mx-auto flex min-h-dvh w-full flex-col justify-center gap-5 px-3 py-6 sm:px-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt=""
              className="size-11 rounded-lg bg-white object-contain p-0.5 shadow-(--shadow-card)"
            />
            <div>
              <p className="text-base font-semibold text-navy">{t('app.name')}</p>
              <p className="text-xs text-muted">{t('portal.shell.brand')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <section className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card) sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
        {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
      </main>
    </div>
  );
}
