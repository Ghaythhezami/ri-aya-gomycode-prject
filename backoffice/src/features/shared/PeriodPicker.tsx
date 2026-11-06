import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '../../common/DatePicker';
import { Select } from '../../common/Input';
import {
  MAX_PERIOD_DAYS,
  PERIOD_PRESETS,
  detectPreset,
  periodError,
  periodRange,
  shiftPeriod,
  type DateRange,
  type PeriodPreset,
} from './period';

const ARROW =
  'inline-flex size-10 items-center justify-center rounded-md border border-border bg-surface text-text hover:bg-accent';

/**
 * Period selector: presets, a custom range (at most 92 days) and previous/next arrows that
 * move by the period length. `onChange` only fires with a usable range.
 */
export function PeriodPicker({
  value,
  onChange,
  today,
  weekStart = 1,
  locale,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Clinic-local today, YYYY-MM-DD. */
  today: string;
  weekStart?: number;
  /** BCP-47 tag for the date echo. */
  locale?: string;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [forceCustom, setForceCustom] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const preset: PeriodPreset = forceCustom ? 'custom' : detectPreset(value, today, weekStart);
  const error = periodError(draft);

  const choose = (next: PeriodPreset) => {
    if (next === 'custom') {
      setForceCustom(true);
      setDraft(value);
      return;
    }
    setForceCustom(false);
    onChange(periodRange(next, today, weekStart));
  };

  const edit = (patch: Partial<DateRange>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (periodError(next) === null) onChange(next);
  };

  const shift = (direction: 1 | -1) => {
    const next = shiftPeriod(value, direction);
    setDraft(next);
    onChange(next);
  };

  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t('period.label')}>
      <button
        type="button"
        className={ARROW}
        aria-label={t('period.previous')}
        onClick={() => shift(-1)}
      >
        <Prev size={16} aria-hidden="true" />
      </button>
      <div className="w-44">
        <Select
          value={preset}
          aria-label={t('period.select')}
          onChange={(e) => choose(e.target.value as PeriodPreset)}
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`period.presets.${p}`)}
            </option>
          ))}
        </Select>
      </div>
      <button
        type="button"
        className={ARROW}
        aria-label={t('period.next')}
        onClick={() => shift(1)}
      >
        <Next size={16} aria-hidden="true" />
      </button>
      {preset === 'custom' && (
        <>
          <div className="w-44">
            <DatePicker
              label={t('period.from')}
              value={draft.from}
              max={draft.to || undefined}
              invalid={Boolean(error)}
              onChange={(v) => edit({ from: v })}
              locale={locale}
            />
          </div>
          <div className="w-44">
            <DatePicker
              label={t('period.to')}
              value={draft.to}
              min={draft.from || undefined}
              invalid={Boolean(error)}
              onChange={(v) => edit({ to: v })}
              locale={locale}
            />
          </div>
          {error && (
            <p role="alert" className="basis-full text-sm text-error">
              {t(`period.errors.${error}`, { max: MAX_PERIOD_DAYS })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
