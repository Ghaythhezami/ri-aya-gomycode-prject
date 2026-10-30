import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, HeartPulse, ShieldCheck, Users } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
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

      <main className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,560px)] lg:gap-16 lg:px-12">
        <section className="auth-rise hidden lg:block">
          <img
            src="/riaya-logo.png"
            alt="Ri'aya — رعاية"
            className="-ms-10 -mt-8 mb-2 h-72 w-72 object-contain mix-blend-multiply"
          />
          <h2 className="text-5xl leading-[1.15] font-bold tracking-tight text-navy">
            {t('auth.heroTitleLine1')}
            <br />
            <span className="bg-linear-to-r from-primary to-[#1565c0] bg-clip-text text-transparent">
              {t('auth.heroTitleLine2')}
            </span>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            {t('auth.heroSubtitle')}
          </p>
          <ul className="mt-12 flex max-w-lg">
            {features.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex-1 border-s border-border px-5 first:border-s-0 first:ps-0"
              >
                <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-accent text-primary shadow-[0_6px_16px_rgba(15,118,110,0.15)]">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <span className="block text-sm leading-snug font-medium text-text">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-rise auth-rise-delay mx-auto w-full max-w-[560px]">
          <img
            src="/riaya-logo.png"
            alt="Ri'aya — رعاية"
            className="mx-auto -my-4 h-40 w-40 object-contain mix-blend-multiply lg:hidden"
          />
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_60px_-12px_rgba(21,40,63,0.18)] backdrop-blur-xl sm:p-10">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
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
        </section>
      </main>
    </div>
  );
}

function AuthDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#d5eef6]/60 blur-3xl" />
      <div className="absolute top-1/3 -left-48 h-[420px] w-[420px] rounded-full bg-[#d9f3ee]/70 blur-3xl" />
      <svg
        className="absolute bottom-0 left-0 h-[46%] w-full lg:w-[62%]"
        viewBox="0 0 900 400"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="auth-wave-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5fd3bf" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="auth-wave-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14a38b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7fdccc" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          d="M0 120 C 220 60, 380 260, 620 280 S 860 330, 900 400 L 0 400 Z"
          fill="url(#auth-wave-a)"
        />
        <path
          d="M0 230 C 180 180, 320 330, 560 350 S 780 380, 820 400 L 0 400 Z"
          fill="url(#auth-wave-b)"
        />
      </svg>
      <HeartPulse
        className="absolute top-[38%] right-[3%] hidden text-primary/10 xl:block"
        size={120}
        strokeWidth={1.25}
      />
    </div>
  );
}
