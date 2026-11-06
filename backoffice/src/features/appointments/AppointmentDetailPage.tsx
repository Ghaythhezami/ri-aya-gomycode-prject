import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  DoorOpen,
  Mail,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { can } from '@riaya/shared';
import type { AppointmentDetail, AppointmentStatus, ReminderDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Textarea } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import { StatusBadge, TypeLabel } from '../shared/StatusBadge';
import { allowedActions, type RowAction } from './actions';
import { useApptDetailQuery, useApptRetryReminderMutation, useApptUpdateMutation } from './api';
import { CancelDialog } from './CancelDialog';
import { RescheduleDialog } from './RescheduleDialog';
import { useAppointmentActions, useErrorText } from './useActions';

const FLOW: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
];

/** The state machine as a progress list: past steps are checked, the current one is named. */
function StatusTimeline({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  const terminal = status === 'CANCELLED' || status === 'NO_SHOW';
  const currentIndex = FLOW.indexOf(status);

  return (
    <ol
      aria-label={t('appointments.detail.progress')}
      className="flex flex-wrap items-center gap-x-2 gap-y-2"
    >
      {FLOW.map((step, index) => {
        const done = !terminal && index < currentIndex;
        const current = !terminal && index === currentIndex;
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
                current
                  ? 'bg-primary text-white'
                  : done
                    ? 'bg-accent text-primary'
                    : 'border border-border text-muted'
              }`}
            >
              {done ? <Check size={12} aria-hidden="true" /> : null}
              {t(`clinic.status.${step}`)}
            </span>
            {index < FLOW.length - 1 ? (
              <span aria-hidden="true" className="h-px w-4 bg-border-strong/50" />
            ) : null}
          </li>
        );
      })}
      {terminal ? (
        <li aria-current="step">
          <StatusBadge status={status} />
        </li>
      ) : null}
    </ol>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-end text-sm font-medium text-text">{children}</dd>
    </div>
  );
}

function offsetLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  minutes: number,
) {
  if (minutes % 1440 === 0) return t('appointments.reminders.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('appointments.reminders.hours', { count: minutes / 60 });
  return t('appointments.reminders.minutes', { count: minutes });
}

function ReminderRow({ reminder, canRetry }: { reminder: ReminderDto; canRetry: boolean }) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const toast = useToast();
  const errorText = useErrorText();
  const [retry, { isLoading }] = useApptRetryReminderMutation();
  const Icon = reminder.channel === 'SMS' ? MessageSquare : Mail;

  const tone = {
    SENT: 'bg-success/10 text-success',
    FAILED: 'bg-error/10 text-error',
    PENDING: 'bg-muted/10 text-muted',
    CANCELLED: 'bg-muted/10 text-muted',
  }[reminder.status];

  async function onRetry() {
    try {
      await retry(reminder.id).unwrap();
      toast.success(t('appointments.reminders.retried'));
    } catch (raw) {
      toast.error(errorText(raw));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-md bg-bg text-muted"
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">
          {t(`booking.details.channel.${reminder.channel}`)} ·{' '}
          {offsetLabel(t, reminder.offsetMinutes)}
        </span>
        <span className="block text-xs text-muted">
          {reminder.status === 'SENT' && reminder.sentAt
            ? t('appointments.reminders.sentAt', { when: format.dateTime(reminder.sentAt) })
            : t('appointments.reminders.scheduledFor', {
                when: format.dateTime(reminder.scheduledFor),
              })}
        </span>
        {reminder.status === 'FAILED' && reminder.error ? (
          <span className="block text-xs text-error">{reminder.error}</span>
        ) : null}
      </span>
      <span
        className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-medium ${tone}`}
      >
        {t(`appointments.reminders.status.${reminder.status}`)}
      </span>
      {reminder.status === 'FAILED' && canRetry ? (
        <Button size="sm" variant="secondary" onClick={() => void onRetry()} disabled={isLoading}>
          <RotateCcw size={14} aria-hidden="true" />
          {t('clinic.retry')}
        </Button>
      ) : null}
    </li>
  );
}

function NotesCard({
  appointment,
  editable,
}: {
  appointment: AppointmentDetail;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorText = useErrorText();
  const [update, { isLoading }] = useApptUpdateMutation();
  const [value, setValue] = useState(appointment.notes ?? '');

  // Pick up a change made elsewhere, but never overwrite what the user is typing.
  useEffect(() => {
    setValue(appointment.notes ?? '');
  }, [appointment.id, appointment.updatedAt, appointment.notes]);

  const dirty = value !== (appointment.notes ?? '');

  async function save() {
    try {
      await update({ id: appointment.id, notes: value }).unwrap();
      toast.success(t('appointments.detail.notesSaved'));
    } catch (raw) {
      toast.error(errorText(raw));
    }
  }

  return (
    <Card title={t('appointments.detail.notes')}>
      {editable ? (
        <div className="space-y-3">
          <Textarea
            rows={4}
            maxLength={1000}
            aria-label={t('appointments.detail.notes')}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void save()} disabled={!dirty || isLoading}>
              {t('clinic.save')}
            </Button>
          </div>
        </div>
      ) : appointment.notes ? (
        <p className="whitespace-pre-wrap text-sm text-text">{appointment.notes}</p>
      ) : (
        <p className="text-sm text-muted">{t('appointments.detail.noNotes')}</p>
      )}
    </Card>
  );
}

export function AppointmentDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const format = useClinicFormat();
  const { user } = useAuth();
  const manage = can(user?.role, 'manageAppointments');
  const { setStatus, cancel } = useAppointmentActions();
  const { data, isLoading, isError, error, refetch } = useApptDetailQuery(id, {
    skip: !id,
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [pending, setPending] = useState<AppointmentStatus | null>(null);

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const clinicError = asClinicError(error);
    return (
      <ErrorState
        title={
          clinicError?.status === 404
            ? t('appointments.detail.notFound')
            : t('appointments.errorTitle')
        }
        description={t(`errors.${clinicError?.code ?? 'generic'}`, {
          defaultValue: clinicError?.message,
        })}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('clinic.retry')}
            </Button>
            <Link
              to="/appointments"
              className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-primary hover:bg-accent"
            >
              {t('appointments.detail.back')}
            </Link>
          </div>
        }
      />
    );
  }

  const actions = allowedActions(user?.role, data.status, data.allowedTransitions);
  const statusActions = actions.filter(
    (a): a is Extract<RowAction, { kind: 'status' }> => a.kind === 'status',
  );
  const canReschedule = actions.some((a) => a.kind === 'reschedule');
  const canCancel = actions.some((a) => a.kind === 'cancel');

  async function changeStatus(status: AppointmentStatus) {
    setPending(status);
    await setStatus(data!.id, status);
    setPending(null);
  }

  return (
    <div>
      <Link
        to="/appointments"
        className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        {t('appointments.detail.back')}
      </Link>

      <PageHeader
        eyebrow={t('appointments.detail.eyebrow')}
        title={`${t('appointments.detail.title')} #${data.code}`}
        subtitle={`${data.patient.name} · ${format.longDate(data.startsAt)}`}
        actions={
          <>
            <StatusBadge status={data.status} />
            {statusActions.map((action, index) => (
              <Button
                key={action.to}
                variant={index === 0 ? 'primary' : 'secondary'}
                size="sm"
                disabled={pending !== null}
                aria-busy={pending === action.to || undefined}
                onClick={() => void changeStatus(action.to)}
              >
                {t(`appointments.actions.${action.labelKey}`)}
              </Button>
            ))}
            {canReschedule ? (
              <Button variant="secondary" size="sm" onClick={() => setRescheduleOpen(true)}>
                {t('appointments.actions.reschedule')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                {t('appointments.actions.cancel')}
              </Button>
            ) : null}
          </>
        }
      />

      {data.needsReschedule ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4"
        >
          <AlertTriangle size={18} aria-hidden="true" className="shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning">
              {t('appointments.detail.needsRescheduleTitle')}
            </p>
            <p className="text-sm text-text">{t('appointments.detail.needsRescheduleBody')}</p>
          </div>
          {manage ? (
            <Button size="sm" onClick={() => setRescheduleOpen(true)}>
              {t('appointments.actions.reschedule')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-(--shadow-card)">
        <StatusTimeline status={data.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('appointments.detail.summary')}>
            <dl className="divide-y divide-border">
              <Row label={t('appointments.fields.when')}>
                {format.longDate(data.startsAt)} ·{' '}
                <span dir="ltr">
                  {format.time(data.startsAt)} – {format.time(data.endsAt)}
                </span>
              </Row>
              <Row label={t('appointments.fields.duration')}>
                {t('clinic.minutes', { count: data.durationMinutes })}
              </Row>
              <Row label={t('appointments.fields.type')}>
                <TypeLabel type={data.type} />
              </Row>
              <Row label={t('appointments.fields.reason')}>{data.reason || '—'}</Row>
              {data.status === 'CANCELLED' && data.cancelReason ? (
                <Row label={t('appointments.detail.cancelReason')}>{data.cancelReason}</Row>
              ) : null}
            </dl>
          </Card>

          <NotesCard appointment={data} editable={manage} />

          <Card
            title={t('appointments.reminders.title')}
            action={<Bell size={16} aria-hidden="true" className="text-muted" />}
          >
            {data.reminders.length === 0 ? (
              <p className="text-sm text-muted">{t('appointments.reminders.empty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.reminders.map((reminder) => (
                  <ReminderRow key={reminder.id} reminder={reminder} canRetry={manage} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('appointments.fields.patient')}>
            <Link
              to={`/patients/${data.patient.id}`}
              className="flex items-center gap-3 rounded-md hover:text-primary"
            >
              <Avatar initials={data.patient.initials} size="lg" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text">
                  {data.patient.name}
                </span>
                <span dir="ltr" className="block text-xs text-muted">
                  {data.patient.code}
                </span>
              </span>
            </Link>
          </Card>

          <Card title={t('appointments.fields.doctor')}>
            <Link
              to={`/doctors/${data.doctor.id}`}
              className="flex items-center gap-3 rounded-md hover:text-primary"
            >
              <Avatar initials={data.doctor.initials} size="lg" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text">
                  {data.doctor.name}
                </span>
                <span className="block text-xs text-muted">{data.doctor.specialty}</span>
              </span>
            </Link>
          </Card>

          <Card title={t('appointments.fields.room')}>
            <p className="flex items-center gap-2 text-sm text-text">
              <DoorOpen size={16} aria-hidden="true" className="text-muted" />
              {data.room?.name ?? t('appointments.detail.noRoom')}
            </p>
          </Card>
        </div>
      </div>

      <CancelDialog
        open={cancelOpen}
        title={t('appointments.cancel.title', { code: data.code })}
        description={t('appointments.cancel.body', { patient: data.patient.name })}
        confirmLabel={t('appointments.cancel.confirm')}
        onClose={() => setCancelOpen(false)}
        onSubmit={(reason) => cancel(data.id, reason)}
      />
      <RescheduleDialog
        target={
          rescheduleOpen
            ? {
                id: data.id,
                doctor: data.doctor,
                startsAt: data.startsAt,
                durationMinutes: data.durationMinutes,
              }
            : null
        }
        onClose={() => setRescheduleOpen(false)}
      />
    </div>
  );
}
