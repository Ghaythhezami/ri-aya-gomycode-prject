import { useTranslation } from 'react-i18next';
import type { WorkingInterval } from '@riaya/shared';
import { useClinicFormat } from '../shared/format';
import { minutesToTime, timelineRange, weekdayName, weekdayOrder } from './hours';

const HEIGHT = 288;

/** Read-only 7-column timeline of work and break blocks. */
export function WeeklyVisual({ intervals }: { intervals: WorkingInterval[] }) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { start, end } = timelineRange(intervals);
  const span = end - start;
  const hours: number[] = [];
  for (let m = start; m <= end; m += 60) hours.push(m);
  const pos = (minute: number) => ((minute - start) / span) * 100;

  return (
    <section
      aria-label={t('doctors.visual.title')}
      className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text">{t('doctors.visual.title')}</h2>
        <p className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-sm border border-primary/40 bg-primary/20"
            />
            {t('doctors.schedule.kind.WORK')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-sm border border-warning bg-warning/30"
            />
            {t('doctors.schedule.kind.BREAK')}
          </span>
        </p>
      </div>
      <div className="flex gap-2" dir="ltr">
        <div
          className="relative w-10 shrink-0 text-[11px] text-muted"
          style={{ height: HEIGHT, marginTop: 24 }}
        >
          {hours.map((m) => (
            <span key={m} className="absolute end-0 -translate-y-1/2" style={{ top: `${pos(m)}%` }}>
              {minutesToTime(m)}
            </span>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {weekdayOrder(fmt.locale).map((weekday) => {
            const day = intervals.filter((i) => i.weekday === weekday);
            return (
              <div key={weekday} className="min-w-0">
                <p className="h-6 truncate text-center text-xs font-medium text-text" dir="auto">
                  {weekdayName(weekday, fmt.locale, 'short')}
                </p>
                <div className="relative rounded-md bg-bg" style={{ height: HEIGHT }}>
                  {day.length === 0 && (
                    <span className="absolute inset-x-0 top-2 text-center text-[11px] text-muted">
                      {t('doctors.schedule.closed')}
                    </span>
                  )}
                  {[...day]
                    .sort((a) => (a.kind === 'WORK' ? -1 : 1))
                    .map((i, index) => (
                      <div
                        key={index}
                        title={`${t(`doctors.schedule.kind.${i.kind}`)} ${minutesToTime(i.startMinute)}–${minutesToTime(i.endMinute)}`}
                        className={`absolute inset-x-0.5 overflow-hidden rounded-sm border px-0.5 text-center text-[10px] leading-tight ${
                          i.kind === 'WORK'
                            ? 'border-primary/40 bg-primary/20 text-primary-dark'
                            : 'border-warning bg-warning/30 text-text'
                        }`}
                        style={{
                          top: `${pos(i.startMinute)}%`,
                          height: `${((i.endMinute - i.startMinute) / span) * 100}%`,
                        }}
                      >
                        <span className="sr-only">{t(`doctors.schedule.kind.${i.kind}`)} </span>
                        {minutesToTime(i.startMinute)}–{minutesToTime(i.endMinute)}
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
