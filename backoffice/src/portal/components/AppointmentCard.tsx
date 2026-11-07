import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PortalAppointment } from '@riaya/shared';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';
import { Textarea, Field } from '../../common/Input';
import { useToast } from '../../common/Toast';
import { useCancelMutation, useRescheduleMutation } from '../api';
import { changeGate, statusTone } from '../lib/appointments';
import { conflictAlternatives, isSlotConflict } from '../lib/conflict';
import { downloadIcs, type IcsEvent } from '../lib/ics';
import { dateInZone } from '../lib/slots';
import { portalErrorMessage } from '../lib/session';
import { usePortalFormat } from '../lib/useFormat';
import { usePortalAuth, usePortalMe } from '../PortalAuthContext';
import { Initials, Notice } from './ui';
import { SlotPicker } from './SlotPicker';

export function appointmentIcs(
  appointment: PortalAppointment,
  clinicName: string,
  title: string,
): IcsEvent {
  return {
    uid: appointment.id,
    title,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    description: `${appointment.typeName} - ${appointment.doctor.name}`,
    location: clinicName,
  };
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={statusTone(status)}>
      {t(`portal.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/**
 * One appointment with its actions. Cancel/reschedule are gated by `canChange` (the API checks
 * status and the clinic's notice period); when blocked the card says why instead of hiding it.
 */
export function AppointmentCard({
  appointment,
  showActions = true,
}: {
  appointment: PortalAppointment;
  showActions?: boolean;
}) {
  const { t } = useTranslation();
  const format = usePortalFormat();
  const me = usePortalMe();
  const gate = changeGate(appointment);
  const [dialog, setDialog] = useState<'cancel' | 'reschedule' | null>(null);

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-(--shadow-card)">
      <div className="flex items-start gap-3">
        <Initials value={appointment.doctor.initials} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-text">{appointment.doctor.name}</h3>
          <p className="truncate text-sm text-muted">
            {appointment.doctor.specialty} · {appointment.typeName}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <p className="mt-3 text-sm font-medium text-text">
        <time dateTime={appointment.startsAt}>{format.dateTime(appointment.startsAt)}</time>
      </p>
      {appointment.reason ? (
        <p className="mt-1 text-sm text-muted">
          {t('portal.appointments.reason')}: {appointment.reason}
        </p>
      ) : null}

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {appointment.status !== 'CANCELLED' && new Date(appointment.endsAt) > new Date() ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadIcs(
                  appointmentIcs(
                    appointment,
                    me.clinicName,
                    t('portal.calendar.title', { doctor: appointment.doctor.name }),
                  ),
                  `appointment-${appointment.code}.ics`,
                )
              }
            >
              <CalendarPlus size={16} aria-hidden />
              {t('portal.calendar.add')}
            </Button>
          ) : null}
          {gate === 'allowed' ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDialog('reschedule')}>
                {t('portal.appointments.reschedule')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog('cancel')}>
                {t('portal.appointments.cancel')}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {showActions && gate === 'tooLate' ? (
        <p className="mt-3 text-xs text-muted" role="note">
          {t('portal.appointments.tooLate')}
        </p>
      ) : null}

      {dialog === 'cancel' ? (
        <CancelDialog appointment={appointment} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'reschedule' ? (
        <RescheduleDialog appointment={appointment} onClose={() => setDialog(null)} />
      ) : null}
    </article>
  );
}

function CancelDialog({
  appointment,
  onClose,
}: {
  appointment: PortalAppointment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const format = usePortalFormat();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cancel, { isLoading }] = useCancelMutation();

  async function confirm() {
    setError(null);
    try {
      await cancel({ id: appointment.id, reason: reason.trim() || undefined }).unwrap();
      toast.success(t('portal.appointments.cancelled'));
      onClose();
    } catch (e) {
      setError(
        portalErrorMessage(
          { response: { data: (e as { data?: unknown }).data } },
          t('portal.appointments.cancelFailed'),
        ),
      );
    }
  }

  return (
    <Modal
      open
      title={t('portal.appointments.cancelTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('portal.appointments.keep')}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={isLoading}>
            {isLoading ? t('portal.common.saving') : t('portal.appointments.confirmCancel')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-text">
        {t('portal.appointments.cancelBody', {
          doctor: appointment.doctor.name,
          when: format.dateTime(appointment.startsAt),
        })}
      </p>
      <Field label={t('portal.appointments.cancelReason')}>
        <Textarea
          value={reason}
          maxLength={300}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </Modal>
  );
}

function RescheduleDialog({
  appointment,
  onClose,
}: {
  appointment: PortalAppointment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { timeZone } = usePortalAuth();
  const format = usePortalFormat();
  const [date, setDate] = useState(() => dateInZone(new Date(), timeZone));
  const [startsAt, setStartsAt] = useState('');
  const [error, setError] = useState<{
    message: string;
    alternatives: { startsAt: string }[];
  } | null>(null);
  const [reschedule, { isLoading }] = useRescheduleMutation();

  async function confirm() {
    setError(null);
    try {
      await reschedule({ id: appointment.id, startsAt }).unwrap();
      toast.success(t('portal.appointments.rescheduled'));
      onClose();
    } catch (e) {
      const wrapped = { response: { data: (e as { data?: unknown }).data } };
      setStartsAt('');
      setError({
        message: isSlotConflict(wrapped)
          ? t('portal.booking.conflict')
          : portalErrorMessage(wrapped, t('portal.appointments.rescheduleFailed')),
        alternatives: conflictAlternatives(wrapped),
      });
    }
  }

  return (
    <Modal
      open
      title={t('portal.appointments.rescheduleTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('portal.common.close')}
          </Button>
          <Button onClick={() => void confirm()} disabled={!startsAt || isLoading}>
            {isLoading ? t('portal.common.saving') : t('portal.appointments.confirmReschedule')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {t('portal.appointments.rescheduleBody', { doctor: appointment.doctor.name })}
      </p>
      <SlotPicker
        doctorId={appointment.doctor.id}
        date={date}
        onDateChange={(d) => {
          setDate(d);
          setStartsAt('');
        }}
        value={startsAt}
        onSelect={(s) => setStartsAt(s.startsAt)}
        timeZone={timeZone}
      />
      {error ? (
        <div className="mt-3 space-y-2">
          <Notice tone="error">{error.message}</Notice>
          {error.alternatives.length ? (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('portal.booking.alternatives')}
            >
              {error.alternatives.map((a) => (
                <Button
                  key={a.startsAt}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDate(dateInZone(a.startsAt, timeZone));
                    setStartsAt(a.startsAt);
                    setError(null);
                  }}
                >
                  {format.dateTime(a.startsAt)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
