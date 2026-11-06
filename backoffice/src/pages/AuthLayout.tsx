import type { ReactNode } from 'react';
import { Clock, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../layouts/LanguageSwitcher';

const VALUES = [
  { key: 'valueSecure', Icon: ShieldCheck },
  { key: 'valueScheduling', Icon: Clock },
  { key: 'valueCare', Icon: Users },
] as const;

/**
 * Split auth layout (project-overview/ri-aya.png): brand panel with logo, headline and
 * three value icons on one side, form card with the language pills on the other.
 * The brand panel collapses to a compact logo row below `lg`.
 */
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const logo = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-accent/60 via-bg to-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -start-40 size-[32rem] rounded-full bg-primary/10 blur-3xl"
      />
      <main className="relative mx-auto grid min-h-screen max-w-6xl content-start gap-10 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:content-center lg:items-center lg:gap-16 lg:py-12">
        <section className="flex flex-col gap-6 lg:gap-8" aria-label={t('app.name')}>
          <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-4">
            <img
              src={logo}
              alt={t('app.name')}
              className="size-12 rounded-lg bg-white object-contain p-0.5 shadow-(--shadow-card) lg:size-36"
            />
            <p className="text-lg font-semibold text-navy lg:hidden">{t('app.name')}</p>
          </div>
          <div className="hidden space-y-4 lg:block">
            <p className="text-4xl font-semibold leading-tight tracking-tight text-navy">
              {t('auth.brandHeadline')}
            </p>
            <p className="max-w-sm text-base text-muted">{t('auth.brandBody')}</p>
          </div>
          <ul className="hidden gap-6 lg:flex">
            {VALUES.map(({ key, Icon }) => (
              <li key={key} className="flex max-w-28 flex-col items-start gap-2">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
                  <Icon size={22} aria-hidden />
                </span>
                <span className="text-sm font-medium text-text">{t(`auth.${key}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full max-w-md justify-self-center rounded-lg border border-border bg-surface p-6 shadow-(--shadow-card) sm:p-8 lg:max-w-none">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">{title}</h1>
              {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
            </div>
            <LanguageSwitcher />
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}
