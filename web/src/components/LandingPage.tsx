import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  CalendarDays,
  Check,
  LineChart,
  Palette,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { Header } from './Header';
import { DashboardPreview } from './DashboardPreview';
import { BrandLogo } from './BrandLogo';

const workspace = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? 'http://localhost:5173';

export function LandingPage() {
  const hero = useTranslations('hero');
  const trust = useTranslations('trust');
  const features = useTranslations('features');
  const dark = useTranslations('dark');
  const footer = useTranslations('footer');
  const nav = useTranslations('nav');

  const checks = [hero('check1'), hero('check2'), hero('check3')];
  const featureItems = [
    { icon: CalendarDays, title: features('s1Title'), body: features('s1Body') },
    { icon: Users, title: features('s2Title'), body: features('s2Body') },
    { icon: Sparkles, title: features('s3Title'), body: features('s3Body') },
    { icon: LineChart, title: features('s4Title'), body: features('s4Body') },
  ];
  const bars = [42, 58, 47, 66, 51, 38, 28];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#ddf6f3,transparent_42%),linear-gradient(180deg,#f7fbfa,#f7f9fc)]">
      <Header />
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-2 lg:items-center lg:px-6 lg:py-24">
          <div>
            <p className="inline-flex min-h-8 items-center rounded-full bg-accent px-3 text-xs font-semibold text-primary">
              {hero('badge')}
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-navy sm:text-5xl">
              {hero('title')}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted">{hero('subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={workspace}
                className="inline-flex min-h-12 items-center gap-2 rounded-[12px] bg-primary px-5 text-sm font-medium text-white shadow-sm"
              >
                {hero('primary')}
                <ArrowRight className="rtl-flip" size={16} />
              </a>
              <a
                href={`${workspace}/ui`}
                className="inline-flex min-h-12 items-center gap-2 rounded-[12px] border border-primary/20 bg-white px-5 text-sm font-medium text-primary"
              >
                <Palette size={16} />
                {hero('designSystem')}
              </a>
              <a
                href="#platform"
                className="inline-flex min-h-12 items-center rounded-[12px] px-5 text-sm font-medium text-muted"
              >
                {hero('secondary')}
              </a>
            </div>
            <ul className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {checks.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-text">
                  <span className="grid size-6 place-items-center rounded-full bg-accent text-primary">
                    <Check size={14} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <DashboardPreview />
        </section>

        <section className="border-y border-border bg-white/80 py-10">
          <div className="mx-auto max-w-6xl px-4 lg:px-6">
            <p className="text-center text-sm font-medium text-muted">{trust('title')}</p>
            <div className="mt-6 grid grid-cols-2 gap-4 text-center text-sm font-semibold text-navy md:grid-cols-4">
              <p>{trust('one')}</p>
              <p>{trust('two')}</p>
              <p>{trust('three')}</p>
              <p>{trust('four')}</p>
            </div>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {features('kicker')}
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-navy">
            {features('title')}
          </h2>
          <div id="solutions" className="mt-10 grid gap-4 md:grid-cols-2">
            {featureItems.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-[16px] border border-border bg-white p-6 shadow-[0_8px_24px_rgba(21,40,63,0.04)]"
                >
                  <span className="grid size-11 place-items-center rounded-[12px] bg-accent text-primary">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                  <a
                    href={`${workspace}/ui`}
                    className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary"
                  >
                    {features('learn')}
                    <ArrowRight className="rtl-flip" size={14} />
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section id="security" className="bg-navy py-20 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center lg:px-6">
            <div>
              <Shield className="mb-4" />
              <h2 className="text-3xl font-semibold tracking-tight">{dark('title')}</h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-white/70">{dark('body')}</p>
              <a
                href={`${workspace}/ui`}
                className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-[12px] bg-primary px-5 text-sm font-medium text-white"
              >
                {hero('designSystem')}
                <ArrowRight className="rtl-flip" size={16} />
              </a>
            </div>
            <div className="rounded-[16px] bg-white p-5 text-text">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">{dark('chartTitle')}</p>
                <p className="text-xs text-muted">{dark('sample')}</p>
              </div>
              <p className="text-3xl font-semibold text-navy">12 min</p>
              <p className="mt-1 text-xs font-medium text-primary">{dark('delta')}</p>
              <div className="mt-5 flex h-40 items-end gap-3">
                {bars.map((value, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t-md bg-primary/90"
                    style={{ height: `${value}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4 lg:px-6">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12" />
              <span className="font-semibold text-navy">RI&apos;AYA</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted">{footer('blurb')}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{footer('product')}</p>
            <a className="mt-3 block text-sm text-muted" href="#platform">
              {nav('platform')}
            </a>
            <a className="mt-2 block text-sm text-muted" href={`${workspace}/ui`}>
              {hero('designSystem')}
            </a>
            <a className="mt-2 block text-sm text-muted" href={workspace}>
              {nav('openWorkspace')}
            </a>
          </div>
          <div>
            <p className="text-sm font-semibold">{footer('legal')}</p>
            <p className="mt-3 text-sm text-muted">{footer('privacy')}</p>
            <p className="mt-2 text-sm text-muted">{footer('terms')}</p>
          </div>
        </div>
        <p className="border-t border-border px-4 py-6 text-center text-xs text-muted">
          {footer('rights')}
        </p>
      </footer>
    </div>
  );
}
