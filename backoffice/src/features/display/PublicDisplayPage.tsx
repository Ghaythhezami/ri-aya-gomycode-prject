import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { PublicDisplay } from '@riaya/shared';
import { negotiateLocale } from '@riaya/shared';
import { usePublicDisplay } from './usePublicDisplay';

const MAX_WAITING = 30;

/**
 * Presentational TV board. It receives only queue numbers and rooms, so no
 * patient name can ever reach this screen.
 */
export function DisplayBoard({
  data,
  lost,
  now,
}: {
  data: PublicDisplay | null;
  lost: boolean;
  now: Date;
}) {
  const { t, i18n } = useTranslation();
  const locale = negotiateLocale(i18n.resolvedLanguage);
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const clock = new Intl.DateTimeFormat(tag, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const day = new Intl.DateTimeFormat(tag, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  const waiting = data?.waiting ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-navy p-6 text-white sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold sm:text-5xl">{data?.clinicName ?? t('app.name')}</h1>
        <div className="text-end">
          <p className="text-4xl font-semibold tabular-nums sm:text-6xl" dir="ltr">
            {clock}
          </p>
          <p className="mt-1 text-lg opacity-90">{day}</p>
        </div>
      </header>

      {lost && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-3 rounded-lg bg-warning px-5 py-3 text-lg font-semibold text-navy"
        >
          <WifiOff size={24} aria-hidden="true" />
          {t('display.board.connectionLost')}
        </p>
      )}

      <main className="mt-8 grid flex-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="serving-title">
          <h2
            id="serving-title"
            className="text-2xl font-semibold uppercase tracking-wide sm:text-3xl"
          >
            {t('display.board.nowServing')}
          </h2>
          {!data ? (
            <p className="mt-6 text-2xl opacity-80">{t('clinic.loading')}</p>
          ) : data.nowServing.length === 0 ? (
            <p className="mt-6 text-2xl opacity-80">{t('display.board.nobody')}</p>
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2">
              {data.nowServing.map((s) => (
                <li
                  key={s.number}
                  className="rounded-2xl border-2 border-white/40 bg-white/10 p-6 text-center"
                >
                  <p className="text-7xl font-extrabold leading-none sm:text-8xl" dir="ltr">
                    {s.number}
                  </p>
                  {s.room && (
                    <p className="mt-4 text-3xl font-semibold">
                      {t('display.board.room')} <span dir="ltr">{s.room}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="waiting-title" className="rounded-2xl bg-white/10 p-6">
          <h2 id="waiting-title" className="text-2xl font-semibold uppercase tracking-wide">
            {t('display.board.waiting')}
          </h2>
          {data && waiting.length === 0 ? (
            <p className="mt-4 text-xl opacity-80">{t('display.board.noneWaiting')}</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-3" aria-live="polite">
              {waiting.slice(0, MAX_WAITING).map((w) => (
                <li
                  key={w.number}
                  className="rounded-lg border border-white/40 px-4 py-2 text-3xl font-bold"
                  dir="ltr"
                >
                  {w.number}
                </li>
              ))}
            </ul>
          )}
          {waiting.length > MAX_WAITING && (
            <p className="mt-3 text-lg opacity-80">
              {t('display.board.more', { count: waiting.length - MAX_WAITING })}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

/** Route `/display/:clinicId`: no auth, outside the app shell. */
export function PublicDisplayPage() {
  const { clinicId } = useParams();
  const { data, lost } = usePublicDisplay(clinicId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <DisplayBoard data={data} lost={lost} now={now} />;
}
