import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Rocket, Settings, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { clearFirstRun, isFirstRun } from '../lib/firstRun';

export function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [firstRun, setFirstRun] = useState(isFirstRun);
  const hour = new Date().getHours();
  const key =
    hour < 12 ? 'shell.greeting' : hour < 18 ? 'shell.greetingAfternoon' : 'shell.greetingEvening';

  return (
    <div className="space-y-6">
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

      {firstRun && (
        <section className="panel relative overflow-hidden p-6 sm:p-8">
          <div
            aria-hidden
            className="absolute -top-20 -end-20 h-56 w-56 rounded-full bg-[#d5eef6]/70 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-linear-to-br from-teal to-blue text-white shadow-[0_12px_24px_-10px_rgba(21,101,192,0.6)]">
              <Rocket size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-navy">{t('firstRun.title')}</h2>
              <p className="mt-1 text-muted">{t('firstRun.body')}</p>
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                <li className="flex items-start gap-3 rounded-[16px] border border-border/80 bg-slate-50/70 p-4 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary">
                    <UserPlus size={17} />
                  </span>
                  <span className="text-text">
                    {t('firstRun.stepInvite')}{' '}
                    <Link className="font-semibold text-primary hover:underline" to="/staff">
                      {t('firstRun.inviteLink')}
                    </Link>
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-[16px] border border-border/80 bg-slate-50/70 p-4 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary">
                    <Settings size={17} />
                  </span>
                  <span className="text-text">{t('firstRun.stepSettings')}</span>
                </li>
              </ul>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[10px] px-3 py-2 text-sm font-semibold text-muted transition hover:bg-slate-100 hover:text-navy"
              onClick={() => {
                clearFirstRun();
                setFirstRun(false);
              }}
            >
              <X size={15} />
              {t('firstRun.dismiss')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
