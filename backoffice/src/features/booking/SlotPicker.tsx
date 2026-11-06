import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DayPeriod, SlotDto } from '@riaya/shared';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { useBookSlotsQuery } from './api';

const PERIODS: DayPeriod[] = ['MORNING', 'AFTERNOON', 'EVENING'];

/**
 * Morning / Afternoon / Evening filter and slot grid for one doctor and day
 * (APP-3). Reused by the reschedule dialog. Unavailable slots stay in the grid,
 * announced as unavailable, so staff see why a time cannot be chosen.
 */
export function SlotPicker({
  doctorId,
  date,
  durationMinutes,
  value,
  onSelect,
  busy = false,
}: {
  doctorId: string;
  date: string;
  durationMinutes: number;
  /** ISO instant of the selected slot. */
  value: string;
  onSelect: (slot: SlotDto) => void;
  /** True while a lock is being acquired. */
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const [period, setPeriod] = useState<DayPeriod>('MORNING');
  const settled = useRef('');

  const { data, isFetching, error, refetch } = useBookSlotsQuery(
    { doctorId, date, durationMinutes },
    { skip: !doctorId || !date },
  );

  // Land on the first period that has a free slot, once per doctor/day load.
  useEffect(() => {
    if (!data) return;
    const key = `${doctorId}|${date}|${durationMinutes}`;
    if (settled.current === key) return;
    settled.current = key;
    const first = PERIODS.find((p) => data.some((slot) => slot.period === p && slot.available));
    if (first) setPeriod(first);
  }, [data, doctorId, date, durationMinutes]);

  const visible = useMemo(
    () => (data ?? []).filter((slot) => slot.period === period),
    [data, period],
  );

  if (!doctorId) return null;

  if (error) {
    const clinicError = asClinicError(error);
    return (
      <ErrorState
        title={t('booking.slotsError')}
        description={t(`errors.${clinicError?.code ?? 'generic'}`, {
          defaultValue: clinicError?.message,
        })}
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-10 rounded-md border border-border px-4 text-sm text-text hover:bg-bg"
          >
            {t('clinic.retry')}
          </button>
        }
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div
        role="group"
        aria-label={t('booking.periodLabel')}
        className="mb-3 grid grid-cols-3 rounded-md bg-bg p-1"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={`min-h-10 rounded-md text-xs font-medium ${
              period === p ? 'bg-primary text-white' : 'text-muted hover:text-text'
            }`}
          >
            {t(`booking.period.${p}`)}
          </button>
        ))}
      </div>

      {isFetching && !data ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('booking.noSlots')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2" aria-label={t('booking.slotsLabel')}>
          {visible.map((slot) => {
            const selected = slot.startsAt === value;
            const time = format.time(slot.startsAt);
            return (
              <li key={slot.startsAt}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={!slot.available || busy || undefined}
                  aria-label={slot.available ? time : `${time}, ${t('booking.slotUnavailable')}`}
                  title={slot.available ? undefined : t('booking.slotUnavailable')}
                  onClick={() => {
                    if (slot.available && !busy) onSelect(slot);
                  }}
                  dir="ltr"
                  className={`min-h-10 w-full rounded-md border text-sm transition ${
                    selected
                      ? 'border-primary bg-primary font-semibold text-white'
                      : slot.available
                        ? 'border-border text-text hover:border-primary hover:bg-accent'
                        : 'cursor-not-allowed border-border bg-bg text-muted line-through'
                  }`}
                >
                  {time}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
