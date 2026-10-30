import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const key =
    hour < 12 ? 'shell.greeting' : hour < 18 ? 'shell.greetingAfternoon' : 'shell.greetingEvening';

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-primary via-[#127f86] to-blue p-6 text-white shadow-[0_24px_50px_-24px_rgba(21,101,192,0.7)] sm:p-10">
      <div aria-hidden className="dot-grid absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="absolute -top-24 -end-16 h-72 w-72 rounded-full bg-white/10 blur-2xl"
      />
      <img
        src="/riaya-mark.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -end-6 -bottom-10 hidden h-56 w-56 opacity-15 mix-blend-luminosity md:block"
      />
      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
          <CalendarDays size={14} />
          {new Date().toLocaleDateString()}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t(key, { name: user?.firstName ?? '' })}
        </h1>
        <p className="mt-2 max-w-xl text-white/80">{t('shell.subtitle')}</p>
      </div>
    </section>
  );
}
