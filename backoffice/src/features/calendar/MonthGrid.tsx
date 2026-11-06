import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatYmd, sameMonth, weekDays } from './dates';
import type { CalBlock } from './model';
import { typeBlockClass } from '../shared/StatusBadge';

const MAX_ITEMS = 3;

interface CellProps {
  ymd: string;
  month: string;
  isToday: boolean;
  blocks: readonly CalBlock[];
  locale: string;
  onOpen: (id: string) => void;
  onDay: (ymd: string) => void;
}

const MonthCell = memo(function MonthCell({
  ymd,
  month,
  isToday,
  blocks,
  locale,
  onOpen,
  onDay,
}: CellProps) {
  const { t } = useTranslation();
  const outside = !sameMonth(ymd, month);
  const extra = blocks.length - MAX_ITEMS;

  return (
    <li
      className={`min-h-28 border-s border-t border-border p-1.5 ${outside ? 'bg-bg/60' : ''} ${
        isToday ? 'bg-accent/40' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onDay(ymd)}
        aria-label={`${formatYmd(ymd, locale, { weekday: 'long', day: 'numeric', month: 'long' })}, ${t(
          'calendar.appointmentsCount',
          { count: blocks.length },
        )}`}
        aria-current={isToday ? 'date' : undefined}
        className={`mb-1 grid size-8 place-items-center rounded-full text-sm ${
          isToday
            ? 'bg-primary font-semibold text-white'
            : outside
              ? 'text-muted'
              : 'text-text hover:bg-accent'
        }`}
      >
        {Number(ymd.slice(8))}
      </button>
      <ul className="space-y-1">
        {blocks.slice(0, MAX_ITEMS).map((block) => (
          <li key={block.item.id}>
            <button
              type="button"
              onClick={() => onOpen(block.item.id)}
              title={`${block.label} ${block.item.patient.name} · ${t(`clinic.type.${block.item.type}`)} · ${t(
                `clinic.status.${block.item.status}`,
              )}`}
              aria-label={`${block.label} ${block.item.patient.name}, ${t(`clinic.type.${block.item.type}`)}, ${t(
                `clinic.status.${block.item.status}`,
              )}`}
              className={`flex min-h-6 w-full items-center gap-1 truncate rounded-sm border px-1 text-start text-[11px] ${typeBlockClass(
                block.item.type,
              )} ${block.item.status === 'CANCELLED' || block.item.status === 'NO_SHOW' ? 'border-dashed opacity-60' : ''}`}
            >
              <span dir="ltr" className="font-semibold">
                {block.label}
              </span>
              <span className="truncate">{block.item.patient.name}</span>
            </button>
          </li>
        ))}
        {extra > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => onDay(ymd)}
              className="min-h-6 px-1 text-[11px] font-medium text-primary hover:underline"
            >
              {t('calendar.more', { count: extra })}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  );
});

/** Month view: six weeks, up to three items per day and a "+N more" link. */
export function MonthGrid({
  days,
  month,
  byDay,
  today,
  locale,
  onOpen,
  onDay,
}: {
  days: string[];
  month: string;
  byDay: Map<string, CalBlock[]>;
  today: string;
  locale: string;
  onOpen: (id: string) => void;
  onDay: (ymd: string) => void;
}) {
  const headers = weekDays(days[0]!);
  const empty: readonly CalBlock[] = [];
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-border bg-bg text-center text-xs font-semibold uppercase tracking-wide text-muted">
          {headers.map((day) => (
            <span key={day} className="py-2">
              {formatYmd(day, locale, { weekday: 'short' })}
            </span>
          ))}
        </div>
        <ul className="grid grid-cols-7 [&>li:nth-child(7n+1)]:border-s-0">
          {days.map((ymd) => (
            <MonthCell
              key={ymd}
              ymd={ymd}
              month={month}
              isToday={ymd === today}
              blocks={byDay.get(ymd) ?? empty}
              locale={locale}
              onOpen={onOpen}
              onDay={onDay}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
