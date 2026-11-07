import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortalSlot } from '@riaya/shared';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useSlotsQuery } from '../api';
import {
  addDays,
  dateInZone,
  dateStrip,
  firstPartWithSlots,
  groupSlots,
  slotOnDate,
  type DayPart,
} from '../lib/slots';
import { usePortalFormat } from '../lib/useFormat';

const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];
const STRIP_DAYS = 7;

/**
 * Day strip (next 7 clinic days, or any later date) plus a morning/afternoon/evening slot grid
 * for one doctor. Dates and day parts are computed in the clinic time zone. Used by booking
 * and by the reschedule dialog.
 */
export function SlotPicker({
  doctorId,
  date,
  onDateChange,
  value,
  onSelect,
  timeZone,
  now,
  durationMinutes,
}: {
  doctorId: string;
  /** Visit length of the chosen type; slots are cut to it. */
  durationMinutes?: number;
  /** Clinic-local `YYYY-MM-DD`. */
  date: string;
  onDateChange: (ymd: string) => void;
  /** ISO instant of the chosen slot. */
  value: string;
  onSelect: (slot: PortalSlot) => void;
  timeZone: string;
  now?: Date;
}) {
  const { t } = useTranslation();
  const format = usePortalFormat();
  const [part, setPart] = useState<DayPart>('morning');
  const today = dateInZone(now ?? new Date(), timeZone);
  const strip = useMemo(() => dateStrip(timeZone, STRIP_DAYS, now), [timeZone, now]);

  const { data, isFetching, isError, refetch } = useSlotsQuery(
    { doctorId, date, ...(durationMinutes ? { durationMinutes } : {}) },
    { skip: !doctorId || !date },
  );
  const groups = useMemo(
    () =>
      groupSlots(
        (data ?? []).filter((s) => slotOnDate(s, date, timeZone)),
        timeZone,
        now,
      ),
    [data, date, timeZone, now],
  );
  const total = PARTS.reduce((n, p) => n + groups[p].length, 0);

  // Land on the first part of the day that has a free slot.
  useEffect(() => {
    if (data) setPart(firstPartWithSlots(groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, date, doctorId]);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={t('portal.slots.pickDay')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {strip.map((ymd) => {
          const chip = format.dayChip(ymd);
          const selected = ymd === date;
          return (
            <button
              key={ymd}
              type="button"
              aria-pressed={selected}
              onClick={() => onDateChange(ymd)}
              className={`flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-md border px-2 text-sm ${
                selected
                  ? 'border-primary bg-primary text-white'
                  : 'border-border-strong bg-surface text-text'
              }`}
            >
              <span className="text-xs">{chip.weekday}</span>
              <span className="font-semibold">{chip.day}</span>
              {ymd === today ? (
                <span className="text-[10px]">{t('portal.slots.today')}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="max-w-xs">
        <DatePicker
          label={t('portal.slots.otherDate')}
          value={date}
          min={today}
          max={addDays(today, 180)}
          locale={document.documentElement.lang}
          onChange={(ymd) => ymd && onDateChange(ymd)}
        />
      </div>

      {isFetching && !data ? (
        <div aria-busy="true" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('portal.slots.error')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('portal.common.retry')}
            </Button>
          }
        />
      ) : total === 0 ? (
        <EmptyState
          title={t('portal.slots.none')}
          description={t('portal.slots.noneHint')}
          action={
            <Button variant="secondary" onClick={() => onDateChange(addDays(date, 1))}>
              {t('portal.slots.nextDay')}
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div
            role="group"
            aria-label={t('portal.slots.partOfDay')}
            className="mb-3 grid grid-cols-3 rounded-md bg-bg p-1"
          >
            {PARTS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={part === p}
                onClick={() => setPart(p)}
                className={`min-h-10 rounded-sm px-2 text-sm font-medium ${
                  part === p ? 'bg-surface text-primary shadow-(--shadow-card)' : 'text-muted'
                }`}
              >
                {t(`portal.slots.parts.${p}`)} ({groups[p].length})
              </button>
            ))}
          </div>
          {groups[part].length === 0 ? (
            <p className="py-4 text-center text-sm text-muted" role="status">
              {t('portal.slots.noneInPart')}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {groups[part].map((slot) => {
                const selected = slot.startsAt === value;
                return (
                  <li key={slot.startsAt}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(slot)}
                      className={`min-h-11 w-full rounded-md border text-sm font-medium ${
                        selected
                          ? 'border-primary bg-primary text-white'
                          : 'border-border-strong bg-surface text-text hover:bg-accent'
                      }`}
                    >
                      {selected ? <span aria-hidden>✓ </span> : null}
                      {format.time(slot.startsAt)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
