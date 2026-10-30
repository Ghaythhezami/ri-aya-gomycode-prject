import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  HeartPulse,
  Hospital,
  KeyRound,
  Languages,
  LineChart,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Users,
} from 'lucide-react';
import { links } from '@/lib/links';
import { Header } from './Header';
import { Footer } from './Footer';
import { DashboardPreview } from './DashboardPreview';
import { BrandMark } from './BrandLogo';
import { Reveal } from './home/Reveal';
import { SectionHeading } from './home/SectionHeading';
import { RolesTabs } from './home/RolesTabs';
import { SupportWidget } from './home/SupportWidget';

export function LandingPage() {
  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-bg">
      <Header />
      {/* Pulled up under the sticky header so the hero backdrop shows through it */}
      <div className="brand-bg relative -mt-[76px] pt-[76px]">
        <HeroDecor />
        <Hero />
      </div>
      <main>
        <TrustBar />
        <Features />
        <HowItWorks />
        <Roles />
        <Security />
        <CallToAction />
      </main>
      <Footer />
      <SupportWidget />
    </div>
  );
}

function Hero() {
  const t = useTranslations('hero');
  const checks = [t('check1'), t('check2'), t('check3')];

  return (
    <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:pt-16 lg:pb-32">
      <div>
        <p className="rise inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/70 py-1.5 ps-1.5 pe-4 text-xs font-semibold text-primary shadow-sm backdrop-blur">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent">
            <Sparkles size={13} />
          </span>
          {t('badge')}
        </p>
        <h1 className="rise rise-1 mt-8 text-4xl leading-[1.15] font-bold tracking-tight text-navy sm:text-5xl lg:text-[64px] rtl:leading-[1.45]">
          {t('titleLine1')}
          <br />
          {/* Padding keeps Arabic marks (e.g. the shadda) inside the gradient's clip box */}
          <span className="text-brand-gradient inline-block py-1 rtl:py-2">{t('titleLine2')}</span>
        </h1>
        <p className="rise rise-2 mt-6 max-w-xl text-lg leading-relaxed text-muted">
          {t('subtitle')}
        </p>
        <div className="rise rise-3 mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={links.signUp}
            className="btn-brand group inline-flex h-13 items-center justify-center gap-2 rounded-[14px] px-7 font-semibold text-white"
          >
            {t('primary')}
            <ArrowRight
              size={18}
              className="rtl-flip transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
            />
          </a>
          <a
            href="#how"
            className="inline-flex h-13 items-center justify-center gap-2 rounded-[14px] border border-border bg-white/80 px-7 font-semibold text-navy shadow-sm backdrop-blur transition hover:border-primary/30 hover:text-primary"
          >
            {t('secondary')}
          </a>
        </div>
        <ul className="rise rise-3 mt-10 flex flex-wrap gap-x-6 gap-y-3">
          {checks.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm font-medium text-text">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-primary">
                <Check size={14} strokeWidth={3} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="rise rise-2">
        <DashboardPreview />
      </div>
    </section>
  );
}

function HeroDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#d5eef6]/60 blur-3xl" />
      <div className="absolute top-1/3 -left-48 h-[420px] w-[420px] rounded-full bg-[#d9f3ee]/70 blur-3xl" />
      <svg
        className="absolute bottom-0 left-0 h-[42%] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hero-wave-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5fd3bf" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1565c0" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="hero-wave-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14a38b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7fdccc" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          d="M0 170 C 300 90, 560 300, 900 290 S 1300 240, 1440 300 L 1440 400 L 0 400 Z"
          fill="url(#hero-wave-a)"
        />
        <path
          d="M0 280 C 260 220, 520 360, 840 360 S 1280 330, 1440 380 L 1440 400 L 0 400 Z"
          fill="url(#hero-wave-b)"
        />
        <path d="M0 372 C 420 404, 980 336, 1440 368 L 1440 400 L 0 400 Z" fill="#f7f9fc" />
      </svg>
      <HeartPulse
        className="absolute top-[18%] left-[46%] hidden text-primary/10 xl:block"
        size={84}
        strokeWidth={1.25}
      />
    </div>
  );
}

function TrustBar() {
  const t = useTranslations('trust');
  const items = [
    { icon: Stethoscope, label: t('one') },
    { icon: Building2, label: t('two') },
    { icon: Hospital, label: t('three') },
    { icon: HeartPulse, label: t('four') },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <Reveal>
        <p className="text-center text-sm font-semibold text-muted">{t('title')}</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center justify-center gap-3 rounded-[18px] border border-border/80 bg-white px-4 py-5 text-sm font-semibold text-navy shadow-[0_6px_20px_-12px_rgba(21,40,63,0.18)]"
            >
              <Icon size={20} className="shrink-0 text-primary" />
              {label}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

function Features() {
  const t = useTranslations('features');
  const items = [
    { icon: CalendarDays, title: t('s1Title'), body: t('s1Body') },
    { icon: Users, title: t('s2Title'), body: t('s2Body') },
    { icon: Sparkles, title: t('s3Title'), body: t('s3Body') },
    { icon: LineChart, title: t('s4Title'), body: t('s4Body') },
    { icon: Languages, title: t('s5Title'), body: t('s5Body') },
    { icon: ShieldCheck, title: t('s6Title'), body: t('s6Body') },
  ];

  return (
    <section
      id="platform"
      className="mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-24 lg:pb-32"
    >
      <Reveal>
        <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />
      </Reveal>
      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }, index) => {
          const featured = index === 0;
          return (
            <Reveal key={title} delay={(index % 3) * 90} className="h-full">
              <article
                className={`group relative h-full overflow-hidden rounded-[24px] border p-7 transition duration-300 hover:-translate-y-1 ${
                  featured
                    ? 'border-transparent bg-linear-to-br from-primary via-[#127f86] to-blue text-white shadow-[0_24px_50px_-20px_rgba(21,101,192,0.6)]'
                    : 'border-border/80 bg-white shadow-[0_8px_24px_-14px_rgba(21,40,63,0.15)] hover:border-primary/20 hover:shadow-[0_24px_50px_-20px_rgba(15,118,110,0.35)]'
                }`}
              >
                {featured ? (
                  <Icon
                    aria-hidden
                    size={160}
                    strokeWidth={1}
                    className="pointer-events-none absolute -end-8 -bottom-8 text-white/10"
                  />
                ) : null}
                <span
                  className={`relative grid h-12 w-12 place-items-center rounded-[14px] transition ${
                    featured
                      ? 'bg-white/15 text-white'
                      : 'bg-accent text-primary group-hover:bg-linear-to-br group-hover:from-teal group-hover:to-blue group-hover:text-white'
                  }`}
                >
                  <Icon size={22} />
                </span>
                <h3
                  className={`relative mt-6 text-lg font-bold ${featured ? 'text-white' : 'text-navy'}`}
                >
                  {title}
                </h3>
                <p
                  className={`relative mt-2 leading-relaxed ${featured ? 'text-white/80' : 'text-muted'}`}
                >
                  {body}
                </p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  const t = useTranslations('how');
  const steps = [
    { icon: CalendarPlus, title: t('s1Title'), body: t('s1Body') },
    { icon: UserCheck, title: t('s2Title'), body: t('s2Body') },
    { icon: LineChart, title: t('s3Title'), body: t('s3Body') },
  ];

  return (
    <section id="how" className="relative overflow-hidden bg-white py-24 lg:py-32">
      <div
        aria-hidden
        className="dot-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />
        </Reveal>
        <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden
            className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-primary/20 md:block"
          />
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <Reveal delay={index * 120} className="relative text-center">
                <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-linear-to-br from-teal to-blue text-white shadow-[0_14px_30px_-10px_rgba(21,101,192,0.55)]">
                  <Icon size={26} />
                  <span className="absolute -top-2 -end-2 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-navy text-xs font-bold">
                    {index + 1}
                  </span>
                </span>
                <h3 className="mt-6 text-xl font-bold text-navy">{title}</h3>
                <p className="mx-auto mt-3 max-w-xs leading-relaxed text-muted">{body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Roles() {
  const t = useTranslations('roles');
  const stats = [
    { value: '3', label: t('stat1') },
    { value: '4', label: t('stat2') },
    { value: 'RTL', label: t('stat3') },
    { value: '0', label: t('stat4') },
  ];

  return (
    <section id="roles" className="brand-bg relative overflow-hidden py-24 lg:py-32">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />
        </Reveal>
        <Reveal className="mt-14">
          <RolesTabs />
        </Reveal>
        <Reveal className="mt-16">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-white/70 bg-border/70 shadow-[0_16px_40px_-20px_rgba(21,40,63,0.2)] lg:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col-reverse bg-white/90 px-6 py-7 text-center backdrop-blur"
              >
                <dt className="mt-2 text-sm font-medium text-muted">{label}</dt>
                <dd className="text-brand-gradient text-4xl font-bold tracking-tight">{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

function Security() {
  const t = useTranslations('security');
  const points = [
    { icon: Lock, label: t('p1') },
    { icon: KeyRound, label: t('p2') },
    { icon: ShieldCheck, label: t('p3') },
  ];
  const bars = [62, 74, 58, 66, 49, 41, 33];
  const days = t('days').split(',');

  return (
    <section id="security" className="relative overflow-hidden bg-navy py-24 text-white lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-[460px] w-[460px] rounded-full bg-teal/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-40 h-[520px] w-[520px] rounded-full bg-blue/30 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <Reveal>
          <SectionHeading
            align="start"
            tone="light"
            kicker={t('kicker')}
            title={t('title')}
            subtitle={t('body')}
          />
          <ul className="mt-10 space-y-4">
            {points.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-white/10 bg-white/10 text-[#7fdccc]">
                  <Icon size={20} />
                </span>
                <span className="font-medium text-white/90">{label}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-2 backdrop-blur">
            <div className="rounded-[22px] bg-white p-6 text-text sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted">{t('chartTitle')}</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-navy">
                    12 <span className="text-xl font-semibold text-muted">min</span>
                  </p>
                  <p className="mt-2 inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
                    {t('delta')}
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
                  {t('sample')}
                </span>
              </div>
              <div className="mt-8 flex h-44 items-end gap-3">
                {bars.map((value, index) => (
                  <div
                    key={index}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <div
                      className={`w-full rounded-t-[8px] ${
                        index === bars.length - 1
                          ? 'bg-linear-to-t from-teal to-blue'
                          : 'bg-linear-to-t from-primary/20 to-primary/40'
                      }`}
                      style={{ height: `${value}%` }}
                    />
                    <span className="text-[11px] font-medium text-muted">{days[index]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CallToAction() {
  const t = useTranslations('cta');

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[32px] bg-linear-to-br from-primary via-[#127f86] to-blue px-6 py-16 text-center text-white shadow-[0_30px_60px_-24px_rgba(21,101,192,0.6)] sm:px-12">
          <div aria-hidden className="dot-grid absolute inset-0 opacity-20" />
          <div
            aria-hidden
            className="absolute -top-20 -end-20 h-72 w-72 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative mx-auto max-w-2xl">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-white shadow-lg">
              <BrandMark className="h-11 w-11" />
            </span>
            <h2 className="mt-8 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              {t('title')}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/80">{t('body')}</p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={links.signUp}
                className="group inline-flex h-13 items-center justify-center gap-2 rounded-[14px] bg-white px-7 font-semibold text-primary shadow-lg transition hover:-translate-y-0.5"
              >
                {t('primary')}
                <ArrowRight
                  size={18}
                  className="rtl-flip transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                />
              </a>
              <a
                href={links.signIn}
                className="inline-flex h-13 items-center justify-center rounded-[14px] border border-white/30 px-7 font-semibold text-white transition hover:bg-white/10"
              >
                {t('secondary')}
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
