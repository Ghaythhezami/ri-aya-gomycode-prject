import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlternativeSlot, DoctorRef, SlotDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Field, Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { asClinicError } from '../../store/clinicApi';
import { SlotPicker } from '../booking/SlotPicker';
import { todayInZone, zonedParts } from '../calendar/dates';
import { useClinicReferenceQuery } from '../shared/api';
import { useClinicFormat } from '../shared/format';
import { useApptUpdateMutation } from './api';
import { useErrorText } from './useActions';
import { useToast } from '../../common/Toast';

export interface RescheduleTarget {
  id: string;
  doctor: DoctorRef;
  startsAt: string;
  durationMinutes: number;
}

/**
 * Reschedule: doctor, date and slot (the booking slot picker). A 409 SLOT_CONFLICT
 * offers the API's alternatives to pick from instead of failing silently (APP-1).
 */
export function RescheduleDialog({
  target,
  onClose,
}: {
  target: RescheduleTarget | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const format = useClinicFormat();
  const toast = useToast();
  const errorText = useErrorText();
  const reference = useClinicReferenceQuery();
  const [update, { isLoading }] = useApptUpdateMutation();
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [alternatives, setAlternatives] = useState<AlternativeSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const stableClose = useCallback(() => closeRef.current(), []);

  const targetId = target?.id;
  useEffect(() => {
    if (!target) return;
    setDoctorId(target.doctor.id);
    setDate(zonedParts(target.startsAt, format.timeZone).ymd);
    setStartsAt('');
    setAlternatives(null);
    setError(null);
    // Reset only when a different appointment is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const today = todayInZone(format.timeZone);
  const doctors = reference.data?.doctors ?? [];

  async function submit() {
    if (!target || !startsAt) {
      setError(t('appointments.reschedule.pickSlot'));
      return;
    }
    setError(null);
    try {
      await update({
        id: target.id,
        ...(doctorId !== target.doctor.id ? { doctorId } : {}),
        startsAt,
      }).unwrap();
      toast.success(t('appointments.toast.rescheduled'));
      onClose();
    } catch (raw) {
      const clinicError = asClinicError(raw);
      if (clinicError?.code === 'SLOT_CONFLICT') {
        const list = (clinicError.details as { alternatives?: AlternativeSlot[] } | undefined)
          ?.alternatives;
        setAlternatives((list ?? []).slice(0, 3));
        setStartsAt('');
        return;
      }
      setError(errorText(raw));
    }
  }

  function pickAlternative(slot: AlternativeSlot) {
    setDoctorId(slot.doctorId);
    setDate(zonedParts(slot.startsAt, format.timeZone).ymd);
    setStartsAt(slot.startsAt);
    setAlternatives(null);
  }

  return (
    <Modal
      open={target !== null}
      title={t('appointments.reschedule.title')}
      onClose={stableClose}
      actions={
        <>
          <Button variant="secondary" onClick={stableClose} disabled={isLoading}>
            {t('clinic.cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={isLoading}
            aria-busy={isLoading || undefined}
          >
            {t('appointments.reschedule.confirm')}
          </Button>
        </>
      }
    >
      {target ? (
        <div className="space-y-4">
          <p>
            {t('appointments.reschedule.current', {
              when: format.dateTime(target.startsAt),
              doctor: target.doctor.name,
            })}
          </p>

          <Field label={t('appointments.fields.doctor')}>
            <Select
              value={doctorId}
              onChange={(event) => {
                setDoctorId(event.target.value);
                setStartsAt('');
              }}
            >
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name} — {doctor.specialty}
                </option>
              ))}
            </Select>
          </Field>

          <DatePicker
            label={t('appointments.reschedule.date')}
            value={date}
            min={today}
            locale={i18n.resolvedLanguage}
            onChange={(value) => {
              setDate(value);
              setStartsAt('');
            }}
          />

          {alternatives ? (
            <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-semibold text-warning">{t('booking.conflict.title')}</p>
              <p className="mt-1 text-sm text-text">
                {alternatives.length ? t('booking.conflict.body') : t('booking.conflict.none')}
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                {alternatives.map((slot) => (
                  <li key={`${slot.doctorId}-${slot.startsAt}`}>
                    <button
                      type="button"
                      onClick={() => pickAlternative(slot)}
                      className="min-h-12 w-full rounded-md border border-border bg-surface px-2 py-1 text-start text-xs text-text hover:border-primary hover:bg-accent"
                    >
                      <span className="block font-medium">
                        {format.shortDate(slot.startsAt)} ·{' '}
                        <span dir="ltr">{format.time(slot.startsAt)}</span>
                      </span>
                      <span className="block truncate text-muted">{slot.doctorName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {date && doctorId ? (
            <SlotPicker
              doctorId={doctorId}
              date={date}
              durationMinutes={target.durationMinutes}
              value={startsAt}
              onSelect={(slot: SlotDto) => {
                setStartsAt(slot.startsAt);
                setError(null);
              }}
            />
          ) : null}

          <div aria-live="polite">
            {error ? (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
