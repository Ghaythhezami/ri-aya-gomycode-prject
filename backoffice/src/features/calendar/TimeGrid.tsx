import { memo, useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { zoneLabel, formatYmd, zonedToInstant } from './dates';
import { blockGeometry } from './layout';
import { minutesLabel, type CalBlock } from './model';
import { STATUS_ICON } from './statusIcon';
import { typeBlockClass } from '../shared/StatusBadge';

/** Pixels per hour. 500 appointments in a week stay cheap because blocks are plain buttons. */
const HOUR_PX = 64;
const PX_PER_MINUTE = HOUR_PX / 60;

const FADED = new Set(['CANCELLED', 'NO_SHOW']);

interface ColumnProps {
  ymd: string;
  blocks: readonly CalBlock[];
  startHour: number;
  endHour: number;
  isToday: boolean;
  /** Minutes after midnight when this column is today, else null. */
  nowMinutes: number | null;
  locale: string;
  onOpen: (id: string) => void;
  onSlot: ((ymd: string, minutes: number) => void) | null;
}

const DayColumn = memo(function DayColumn({
  ymd,
  blocks,
  startHour,
  endHour,
  isToday,
  nowMinutes,
  onOpen,
  onSlot,
}: ColumnProps) {
  const { t } = useTranslation();
  const hours = endHour - startHour;
  const gridStart = startHour * 60;

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onSlot || (event.target as HTMLElement).closest('[data-block]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = gridStart + (event.clientY - rect.top) / PX_PER_MINUTE;
    onSlot(ymd, minutes);
  };

  return (
    <div
      onClick={onClick}
      style={{ height: hours * HOUR_PX }}
      className={`relative border-s border-border ${isToday ? 'bg-accent/30' : ''} ${
        onSlot ? 'cursor-cell' : ''
      }`}
    >
      {Array.from({ length: hours }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          style={{ height: HOUR_PX }}
          className="border-t border-border"
        />
      ))}

      {blocks.map((block) => {
        const { item } = block;
        const { top, height } = blockGeometry(block.start, block.end, gridStart, PX_PER_MINUTE);
        const Icon = STATUS_ICON[item.status];
        const tall = height >= 44;
        const status = t(`clinic.status.${item.status}`);
        const type = t(`clinic.type.${item.type}`);
        return (
          <button
            key={item.id}
            type="button"
            data-block
            onClick={() => onOpen(item.id)}
            aria-label={`${block.label} ${item.patient.name}, ${type}, ${item.doctor.name}, ${status}`}
            title={`${block.label} ${item.patient.name} · ${type} · ${item.doctor.name} · ${status}`}
            style={{
              top,
              height,
              insetInlineStart: `${(block.col / block.cols) * 100}%`,
              width: `calc(${100 / block.cols}% - 2px)`,
            }}
            className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-start text-[11px] leading-tight transition hover:z-10 hover:shadow-(--shadow-card) ${typeBlockClass(item.type)} ${
              FADED.has(item.status) ? 'border-dashed opacity-60' : ''
            }`}
          >
            <span className="flex items-center gap-1">
              <Icon size={11} aria-hidden="true" className="shrink-0" />
              <span dir="ltr" className="font-semibold">
                {block.label}
              </span>
              <span className="truncate font-medium">{item.patient.name}</span>
            </span>
            {tall ? (
              <span className="block truncate opacity-90">
                {type} · {item.doctor.name}
              </span>
            ) : null}
            {height >= 60 ? <span className="block truncate opacity-90">{status}</span> : null}
          </button>
        );
      })}

      {nowMinutes !== null && nowMinutes >= gridStart && nowMinutes <= endHour * 60 ? (
        <div
          aria-hidden="true"
          style={{ top: (nowMinutes - gridStart) * PX_PER_MINUTE }}
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-alert"
        >
          <span className="absolute -top-[5px] -start-[5px] size-2 rounded-full bg-alert" />
        </div>
      ) : null}
    </div>
  );
});

/**
 * Day and week view: a time column plus one column per day, blocks positioned by
 * time. The columns are memoised, so a clock tick only re-renders today's column.
 */
export function TimeGrid({
  days,
  byDay,
  today,
  nowMinutes,
  startHour,
  endHour,
  timeZone,
  locale,
  onOpen,
  onSlot,
  onDayHeader,
}: {
  days: string[];
  byDay: Map<string, CalBlock[]>;
  today: string;
  nowMinutes: number;
  startHour: number;
  endHour: number;
  timeZone: string;
  locale: string;
  onOpen: (id: string) => void;
  onSlot: ((ymd: string, minutes: number) => void) | null;
  onDayHeader: (ymd: string) => void;
}) {
  const { t } = useTranslation();
  const columns = `4rem repeat(${days.length}, minmax(0, 1fr))`;
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const empty: readonly CalBlock[] = [];

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div style={{ minWidth: days.length > 1 ? 860 : 320 }}>
        <div
          style={{ gridTemplateColumns: columns }}
          className="sticky top-0 z-20 grid border-b border-border bg-surface"
        >
          <div className="grid place-items-center text-xs text-muted" dir="ltr">
            {zoneLabel(timeZone)}
          </div>
          {days.map((ymd) => (
            <button
              key={ymd}
              type="button"
              onClick={() => onDayHeader(ymd)}
              aria-current={ymd === today ? 'date' : undefined}
              aria-label={formatYmd(ymd, locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              className={`border-s border-border py-3 text-center ${ymd === today ? 'bg-accent' : 'hover:bg-bg'}`}
            >
              <span className="block text-xs text-muted">
                {formatYmd(ymd, locale, { weekday: 'short' })}
              </span>
              <span
                className={`block text-lg font-semibold ${ymd === today ? 'text-primary' : 'text-text'}`}
              >
                {Number(ymd.slice(8))}
              </span>
            </button>
          ))}
        </div>

        <div style={{ gridTemplateColumns: columns }} className="grid">
          <div aria-hidden="true">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: HOUR_PX }}
                className="pe-2 pt-1 text-end text-xs text-muted"
              >
                <span dir="ltr">{minutesLabel(hour * 60)}</span>
              </div>
            ))}
          </div>
          {days.map((ymd) => (
            <DayColumn
              key={ymd}
              ymd={ymd}
              blocks={byDay.get(ymd) ?? empty}
              startHour={startHour}
              endHour={endHour}
              isToday={ymd === today}
              nowMinutes={ymd === today ? nowMinutes : null}
              locale={locale}
              onOpen={onOpen}
              onSlot={onSlot}
            />
          ))}
        </div>
      </div>
      <p className="sr-only">{t('calendar.gridHint')}</p>
    </div>
  );
}

/** Stable slot handler factory used by the page (snaps to the slot grid, skips the past). */
export function useSlotHandler(
  timeZone: string,
  slotMinutes: number,
  onBook: (startsAt: string) => void,
) {
  return useCallback(
    (ymd: string, minutes: number) => {
      const snapped = Math.floor(minutes / slotMinutes) * slotMinutes;
      const startsAt = zonedToInstant(ymd, snapped, timeZone);
      if (new Date(startsAt).getTime() < Date.now()) return;
      onBook(startsAt);
    },
    [timeZone, slotMinutes, onBook],
  );
}
