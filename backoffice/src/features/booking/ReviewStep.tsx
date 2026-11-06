import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarClock, ShieldCheck } from 'lucide-react';
import type { AlternativeSlot } from '@riaya/shared';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import type { BookingForm } from './schema';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

export function ReviewStep({
  form,
  conflict,
  error,
  onPickAlternative,
}: {
  form: BookingForm;
  /** Alternatives offered after a 409 SLOT_CONFLICT, or null. */
  conflict: AlternativeSlot[] | null;
  error: string | null;
  onPickAlternative: (slot: AlternativeSlot) => void;
}) {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const format = useClinicFormat();

  if (!form.patient || !form.doctor || !form.startsAt) return null;

  const end = new Date(new Date(form.startsAt).getTime() + form.durationMinutes * 60000);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-text">{t('booking.review.title')}</h3>

      {conflict ? (
        <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            {t('booking.conflict.title')}
          </p>
          <p className="mt-1 text-sm text-text">
            {conflict.length > 0 ? t('booking.conflict.body') : t('booking.conflict.none')}
          </p>
          {conflict.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {conflict.slice(0, 3).map((slot) => (
                <li key={`${slot.doctorId}-${slot.startsAt}`}>
                  <button
                    type="button"
                    onClick={() => onPickAlternative(slot)}
                    className="min-h-12 w-full rounded-md border border-border bg-surface px-3 py-1 text-start text-sm text-text hover:border-primary hover:bg-accent"
                  >
                    <span className="block font-medium">
                      {format.shortDate(slot.startsAt)} ·{' '}
                      <span dir="ltr">{format.time(slot.startsAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {slot.doctorName} ·{' '}
                      {t(
                        slot.kind === 'SAME_DOCTOR'
                          ? 'booking.conflict.sameDoctor'
                          : 'booking.conflict.sameSpecialty',
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error"
        >
          {error}
        </p>
      ) : null}

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-3 p-4">
          <Avatar initials={form.patient.initials} />
          <div className="min-w-0">
            <dt className="text-xs text-muted">{t('booking.review.patient')}</dt>
            <dd className="truncate text-sm font-semibold text-text">{form.patient.name}</dd>
            <dd className="text-xs text-muted">
              <span dir="ltr">{form.patient.code}</span>
            </dd>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Avatar initials={form.doctor.initials} />
          <div className="min-w-0">
            <dt className="text-xs text-muted">{t('booking.review.doctor')}</dt>
            <dd className="truncate text-sm font-semibold text-text">{form.doctor.name}</dd>
            <dd className="text-xs text-muted">{specialtyLabel(form.doctor.specialty)}</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-accent text-primary"
          >
            <CalendarClock size={16} />
          </span>
          <div>
            <dt className="text-xs text-muted">{t('booking.review.when')}</dt>
            <dd className="text-sm font-semibold text-text">
              {format.longDate(form.startsAt)} ·{' '}
              <span dir="ltr">
                {format.time(form.startsAt)} – {format.time(end)}
              </span>
            </dd>
            <dd className="text-xs text-muted">
              {t(`clinic.type.${form.type}`)} ·{' '}
              {t('clinic.minutes', { count: form.durationMinutes })}
            </dd>
          </div>
        </div>
        <div className="p-4">
          <dt className="text-xs text-muted">{t('booking.review.reminders')}</dt>
          <dd className="text-sm text-text">
            {form.reminderChannels.length
              ? form.reminderChannels.map((c) => t(`booking.details.channel.${c}`)).join(', ')
              : t('booking.review.noReminders')}
          </dd>
        </div>
        {form.reason || form.notes ? (
          <div className="p-4">
            <dt className="text-xs text-muted">{t('booking.review.reason')}</dt>
            {form.reason ? <dd className="text-sm text-text">{form.reason}</dd> : null}
            {form.notes ? <dd className="mt-1 text-xs text-muted">{form.notes}</dd> : null}
          </div>
        ) : null}
      </dl>

      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        {t('booking.review.privacy')}
      </p>
    </div>
  );
}
