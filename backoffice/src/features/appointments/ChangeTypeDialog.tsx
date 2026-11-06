import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlternativeSlot } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { previewEnd, sortTypes, useAppointmentTypesQuery } from '../shared/appointmentTypes';
import { useClinicFormat } from '../shared/format';
import { useApptChangeTypeMutation } from './api';
import { useErrorText } from './useActions';

export interface ChangeTypeTarget {
  id: string;
  type: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

/**
 * Change the type of an appointment. The end time follows the new type's duration unless
 * "Keep current duration" is ticked. A 409 SLOT_CONFLICT lists alternatives and offers the
 * reschedule dialog; OUTSIDE_WORKING_HOURS shows the localised API message.
 */
export function ChangeTypeDialog({
  target,
  onClose,
  onReschedule,
}: {
  target: ChangeTypeTarget | null;
  onClose: () => void;
  onReschedule: () => void;
}) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const toast = useToast();
  const errorText = useErrorText();
  const types = useAppointmentTypesQuery({ includeInactive: true });
  const [change, { isLoading }] = useApptChangeTypeMutation();
  const [type, setType] = useState('');
  const [keepDuration, setKeepDuration] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const stableClose = useCallback(() => closeRef.current(), []);

  const targetId = target?.id;
  useEffect(() => {
    if (!target) return;
    setType(target.type);
    setKeepDuration(false);
    setAlternatives(null);
    setError(null);
    // Reset only when a different appointment is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  // Active types, plus the current one when it was deactivated since.
  const options = useMemo(
    () =>
      sortTypes(
        (types.data ?? []).filter((entry) => entry.isActive || entry.code === target?.type),
      ),
    [types.data, target?.type],
  );
  const selected = options.find((entry) => entry.code === type);
  const newEnd = target
    ? previewEnd(
        target.startsAt,
        target.endsAt,
        selected?.durationMinutes ?? target.durationMinutes,
        keepDuration,
      )
    : '';
  const unchanged = !target || type === target.type;

  async function submit() {
    if (!target || unchanged) return;
    setError(null);
    setAlternatives(null);
    try {
      await change({ id: target.id, type, keepDuration }).unwrap();
      toast.success(t('appointments.toast.typeChanged'));
      onClose();
    } catch (raw) {
      const clinicError = asClinicError(raw);
      if (clinicError?.code === 'SLOT_CONFLICT') {
        const list = (clinicError.details as { alternatives?: AlternativeSlot[] } | undefined)
          ?.alternatives;
        setAlternatives((list ?? []).slice(0, 3));
      }
      setError(errorText(raw));
    }
  }

  return (
    <Modal
      open={target !== null}
      title={t('appointments.changeType.title')}
      onClose={stableClose}
      actions={
        <>
          <Button variant="secondary" onClick={stableClose} disabled={isLoading}>
            {t('clinic.cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={isLoading || unchanged}
            aria-busy={isLoading || undefined}
          >
            {t('appointments.changeType.confirm')}
          </Button>
        </>
      }
    >
      {target ? (
        <div className="space-y-4">
          <Field label={t('appointments.fields.type')}>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              {options.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.displayName} · {t('clinic.minutes', { count: entry.durationMinutes })}
                  {entry.isActive ? '' : ` (${t('appointments.inactive')})`}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex min-h-10 items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={keepDuration}
              onChange={(event) => setKeepDuration(event.target.checked)}
            />
            {t('appointments.changeType.keepDuration')}
          </label>

          <p className="text-sm text-text" aria-live="polite">
            {t('appointments.changeType.preview', {
              start: format.time(target.startsAt),
              end: format.time(newEnd),
            })}
          </p>

          {alternatives ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm text-text">
                {alternatives.length
                  ? t('appointments.changeType.alternatives')
                  : t('booking.conflict.none')}
              </p>
              {alternatives.length ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                  {alternatives.map((slot) => (
                    <li
                      key={`${slot.doctorId}-${slot.startsAt}`}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                    >
                      <span className="block font-medium">
                        {format.shortDate(slot.startsAt)} ·{' '}
                        <span dir="ltr">{format.time(slot.startsAt)}</span>
                      </span>
                      <span className="block truncate text-muted">{slot.doctorName}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={onReschedule}
              >
                {t('appointments.changeType.rescheduleInstead')}
              </Button>
            </div>
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
