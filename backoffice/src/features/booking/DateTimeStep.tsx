import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lock } from 'lucide-react';
import type { SlotDto } from '@riaya/shared';
import { MonthPicker } from './MonthPicker';
import { SlotPicker } from './SlotPicker';
import type { DoctorChoice } from './schema';

export function DateTimeStep({
  doctor,
  date,
  startsAt,
  durationMinutes,
  today,
  locale,
  error,
  warning,
  busy,
  onDate,
  onSlot,
}: {
  doctor: DoctorChoice;
  date: string;
  startsAt: string;
  durationMinutes: number;
  today: string;
  locale: string;
  error?: string;
  /** Inline warning, e.g. "being booked by someone else" (SLOT_LOCKED). */
  warning: string | null;
  busy: boolean;
  onDate: (ymd: string) => void;
  onSlot: (slot: SlotDto) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-text">{t('booking.datetime.title')}</h3>
      <p className="text-sm text-muted">
        {t('booking.datetime.with', { doctor: doctor.name, minutes: durationMinutes })}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {t(error)}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <MonthPicker value={date} onChange={onDate} minDate={today} locale={locale} />
        {date ? (
          <SlotPicker
            doctorId={doctor.id}
            date={date}
            durationMinutes={durationMinutes}
            value={startsAt}
            onSelect={onSlot}
            busy={busy}
          />
        ) : (
          <p className="grid place-items-center rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">
            {t('booking.datetime.pickDateFirst')}
          </p>
        )}
      </div>

      <div aria-live="polite">
        {warning ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
          >
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {warning}
          </p>
        ) : startsAt && !busy ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Lock size={12} aria-hidden="true" />
            {t('booking.datetime.held')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
