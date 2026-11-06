import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  compareYmd,
  formatYmd,
  monthGrid,
  sameMonth,
  startOfMonth,
  weekDays,
} from '../calendar/dates';

/**
 * Month grid for choosing one day (APP-3). Past days are disabled; arrow keys move
 * the focused day (mirrored in RTL), PageUp/PageDown change month.
 */
export function MonthPicker({
  value,
  onChange,
  minDate,
  locale,
}: {
  value: string;
  onChange: (ymd: string) => void;
  /** First selectable day (the clinic's today). */
  minDate: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => startOfMonth(value || minDate));
  const [focusDay, setFocusDay] = useState(value || minDate);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-ymd="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  const cells = monthGrid(month);
  const headers = weekDays(cells[0]!);
  const canGoBack = compareYmd(addMonths(month, -1), startOfMonth(minDate)) >= 0;

  function moveFocus(target: string) {
    if (compareYmd(target, minDate) < 0) return;
    pendingFocus.current = true;
    setFocusDay(target);
    if (!sameMonth(target, month)) setMonth(startOfMonth(target));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = document.documentElement.dir === 'rtl';
    const horizontal = rtl ? -1 : 1;
    const moves: Record<string, () => string> = {
      ArrowRight: () => addDays(focusDay, horizontal),
      ArrowLeft: () => addDays(focusDay, -horizontal),
      ArrowDown: () => addDays(focusDay, 7),
      ArrowUp: () => addDays(focusDay, -7),
      PageDown: () => addMonths(focusDay, 1),
      PageUp: () => addMonths(focusDay, -1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(move());
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label={t('booking.prevMonth')}
          className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg disabled:opacity-40"
        >
          <ChevronLeft size={18} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-text">
          {formatYmd(month, locale, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label={t('booking.nextMonth')}
          className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
        >
          <ChevronRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-muted" aria-hidden="true">
        {headers.map((day) => (
          <span key={day} className="py-1">
            {formatYmd(day, locale, { weekday: 'narrow' })}
          </span>
        ))}
      </div>

      <div ref={grid} role="group" aria-label={t('booking.pickDate')} onKeyDown={onKeyDown}>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day) => {
            const outside = !sameMonth(day, month);
            const past = compareYmd(day, minDate) < 0;
            const selected = day === value;
            const label = formatYmd(day, locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
            return (
              <button
                key={day}
                type="button"
                data-ymd={day}
                disabled={past}
                tabIndex={day === focusDay ? 0 : -1}
                aria-pressed={selected}
                aria-label={label}
                aria-current={day === minDate ? 'date' : undefined}
                onClick={() => {
                  setFocusDay(day);
                  onChange(day);
                }}
                className={`mx-auto grid size-10 place-items-center rounded-md text-sm transition ${
                  selected
                    ? 'bg-primary font-semibold text-white'
                    : past
                      ? 'text-muted/50'
                      : outside
                        ? 'text-muted hover:bg-bg'
                        : 'text-text hover:bg-accent'
                } ${day === minDate && !selected ? 'ring-1 ring-primary' : ''}`}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
