import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, Clock, HeartPulse, ShieldCheck, Users } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Full-bleed frame shared by every unauthenticated screen: brand story on the
 * start side, the form card on the end side. Collapses to the card alone below lg.
 */
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();

  const features = [
    { icon: ShieldCheck, label: t('auth.featureSecure') },
    { icon: Clock, label: t('auth.featureScheduling') },
    { icon: Users, label: t('auth.featureCare') },
  ];

  return (
    <div className="auth-bg relative min-h-screen overflow-hidden">
      <AuthDecor />

      <main className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,540px)] lg:gap-16 lg:px-12">
        <section className="auth-rise relative hidden lg:block">
          <img
            src="/riaya-logo.png"
            alt="Ri'aya — رعاية"
            className="-ms-8 -mt-6 mb-0 h-60 w-60 object-contain mix-blend-multiply"
          />
          <h2 className="text-5xl leading-[1.12] font-bold tracking-tight text-navy xl:text-6xl">
            {t('auth.heroTitleLine1')}
            <br />
            <span className="text-brand-gradient">{t('auth.heroTitleLine2')}</span>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            {t('auth.heroSubtitle')}
          </p>

          <ul className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {features.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="glass rounded-xl border border-surface/80 p-4 shadow-(--shadow-soft)"
              >
                <span className="brand-gradient mb-3 grid size-11 place-items-center rounded-md text-white shadow-(--shadow-glow)">
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="block text-sm leading-snug font-semibold text-navy">{label}</span>
              </li>
            ))}
          </ul>

          <div
            aria-hidden="true"
            className="float glass absolute end-0 top-24 hidden w-56 rounded-xl border border-surface/80 p-4 shadow-(--shadow-float) xl:block"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-accent text-primary">
                <CalendarCheck2 size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted">{t('nav.appointments')}</p>
                <p className="text-lg font-bold text-navy">+24%</p>
              </div>
            </div>
            <div className="mt-3 flex h-10 items-end gap-1.5">
              {[40, 62, 48, 75, 58, 88, 70].map((height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                  className={`flex-1 rounded-sm ${index === 5 ? 'brand-gradient' : 'bg-accent'}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="auth-rise auth-rise-delay mx-auto w-full max-w-[540px]">
          <img
            src="/riaya-logo.png"
            alt="Ri'aya — رعاية"
            className="mx-auto -my-4 h-36 w-36 object-contain mix-blend-multiply lg:hidden"
          />
          <div className="relative overflow-hidden rounded-2xl border border-surface/70 bg-surface/90 p-6 shadow-(--shadow-float) backdrop-blur-xl sm:p-10">
            <span aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                  <span className="live-dot size-1.5 rounded-full bg-teal" />
                  {eyebrow}
                </p>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-3 max-w-sm leading-relaxed text-muted">{subtitle}</p>
                ) : null}
              </div>
              <LanguageSwitcher />
            </div>
            {children}
          </div>
          {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
        </section>
      </main>
    </div>
  );
}

function AuthDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="blob-blue absolute -end-40 -top-40 size-[520px] rounded-full blur-3xl" />
      <div className="blob-teal absolute -start-48 top-1/3 size-[420px] rounded-full blur-3xl" />
      <svg
        className="absolute bottom-0 start-0 h-[46%] w-full text-teal lg:w-[62%]"
        viewBox="0 0 900 400"
        preserveAspectRatio="none"
      >
        <path
          d="M0 120 C 220 60, 380 260, 620 280 S 860 330, 900 400 L 0 400 Z"
          fill="currentColor"
          opacity="0.12"
        />
        <path
          d="M0 230 C 180 180, 320 330, 560 350 S 780 380, 820 400 L 0 400 Z"
          fill="currentColor"
          opacity="0.2"
        />
      </svg>
      <HeartPulse
        className="absolute end-[3%] top-[62%] hidden text-primary/10 xl:block"
        size={120}
        strokeWidth={1.25}
      />
    </div>
  );
}
