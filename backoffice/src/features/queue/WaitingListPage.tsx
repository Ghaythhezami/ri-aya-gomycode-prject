import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  Clock,
  Hourglass,
  Loader2,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueuePriority } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import {
  useCallNextMutation,
  useCheckInMutation,
  useCompleteConsultationMutation,
  useMarkNoShowMutation,
  useNotifyDelayMutation,
  useQueueQuery,
  useSetPriorityMutation,
  useStartConsultationMutation,
} from './api';
import { CheckInModal } from './CheckInModal';
import { displayedWait, isOverTarget } from './queueLogic';
import { QueueRow } from './QueueRow';
import { SelfCheckInPanel } from './SelfCheckInPanel';
import { useLiveSocket } from './useLiveSocket';

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = 'bg-accent text-primary',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
      <span
        aria-hidden="true"
        className={`grid size-11 shrink-0 place-items-center rounded-lg ${tone}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-text" aria-live="polite">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function WaitingListPage() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const toast = useToast();
  const { data, isLoading, isError, refetch, fulfilledTimeStamp } = useQueueQuery(undefined, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  });
  const { enabled: realtime, paused } = useLiveSocket(() => void refetch());

  const [callNext, { isLoading: calling }] = useCallNextMutation();
  const [checkIn, { isLoading: checkingIn }] = useCheckInMutation();
  const [start] = useStartConsultationMutation();
  const [complete] = useCompleteConsultationMutation();
  const [noShow] = useMarkNoShowMutation();
  const [notifyDelay, { isLoading: notifying }] = useNotifyDelayMutation();
  const [setPriority] = useSetPriorityMutation();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const [called, setCalled] = useState<{ number: string; room: string | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [delayFor, setDelayFor] = useState<{ id: string; number: string } | null>(null);
  const [delayMinutes, setDelayMinutes] = useState('10');

  const fail = (raw: unknown) => {
    const e = asClinicError(raw);
    toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
  };

  const doCallNext = async () => {
    try {
      const entry = await callNext().unwrap();
      const room = entry.room?.name ?? null;
      setCalled({ number: entry.number, room });
      toast.success(
        room
          ? t('queue.callNext.called', { number: entry.number, room })
          : t('queue.callNext.calledNoRoom', { number: entry.number }),
      );
    } catch (raw) {
      if (asClinicError(raw)?.code === 'QUEUE_EMPTY') toast.info(t('queue.callNext.empty'));
      else fail(raw);
    }
  };

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (raw) {
      fail(raw);
    }
  };

  const summary = data?.summary;
  const entries = data?.entries ?? [];
  const target = summary?.targetWaitMinutes ?? 15;
  const elapsed = fulfilledTimeStamp ? Math.max(0, now - fulfilledTimeStamp) : 0;
  const ageSeconds = Math.floor(elapsed / 1000);

  const submitDelay = async () => {
    const minutes = Number(delayMinutes);
    if (!delayFor || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) return;
    await run(() => notifyDelay({ id: delayFor.id, minutes }).unwrap(), t('queue.delay.sent'));
    setDelayFor(null);
  };

  let list: ReactNode;
  if (isError && !data) {
    list = (
      <ErrorState
        title={t('queue.error.title')}
        description={t('queue.error.body')}
        action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
      />
    );
  } else if (isLoading) {
    list = (
      <div className="space-y-2 p-4" aria-busy="true" aria-label={t('clinic.loading')}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (entries.length === 0) {
    list = (
      <EmptyState
        icon={<Users size={18} />}
        title={t('queue.empty.title')}
        description={t('queue.empty.body')}
        action={<Button onClick={() => setPickerOpen(true)}>{t('queue.checkIn.button')}</Button>}
      />
    );
  } else {
    list = (
      <ul aria-label={t('queue.liveTitle')}>
        {entries.map((entry) => {
          const shown = displayedWait(entry, elapsed);
          return (
            <QueueRow
              key={entry.id}
              entry={entry}
              waitMinutes={shown}
              overTarget={isOverTarget(entry, shown, target)}
              onStart={() => void run(() => start(entry.id).unwrap(), t('queue.toast.started'))}
              onComplete={() =>
                void run(() => complete(entry.id).unwrap(), t('queue.toast.completed'))
              }
              onNoShow={() => void run(() => noShow(entry.id).unwrap(), t('queue.toast.noShow'))}
              onNotify={() => {
                setDelayMinutes('10');
                setDelayFor({ id: entry.id, number: entry.number });
              }}
              onPriority={(priority: QueuePriority) =>
                void run(
                  () => setPriority({ id: entry.id, priority }).unwrap(),
                  t('queue.toast.priority'),
                )
              }
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t('queue.eyebrow')}
        title={t('queue.title')}
        subtitle={t('queue.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <UserPlus size={16} aria-hidden="true" />
              {t('queue.checkIn.button')}
            </Button>
            <Button
              onClick={() => void doCallNext()}
              disabled={calling}
              aria-busy={calling || undefined}
            >
              {calling ? (
                <Loader2
                  size={16}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <BellRing size={16} aria-hidden="true" />
              )}
              {t('queue.callNext.button')}
            </Button>
          </>
        }
      />

      {realtime && paused && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text"
        >
          <WifiOff size={16} aria-hidden="true" className="text-warning" />
          {t('queue.paused')}
        </p>
      )}

      {called && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-navy px-6 py-5 text-white"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {t('queue.callNext.nowCalling')}
            </p>
            <p className="mt-1 text-3xl font-bold" dir="ltr">
              {called.number}
              {called.room && <span className="ms-3 text-xl font-medium">· {called.room}</span>}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCalled(null)}>
            {t('clinic.close')}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Users size={20} />}
          label={t('queue.summary.waiting')}
          value={summary ? fmt.number(summary.waiting) : '—'}
          hint={summary && t('queue.summary.inConsultation', { count: summary.inConsultation })}
        />
        <SummaryCard
          icon={<Clock size={20} />}
          tone="bg-warning/10 text-warning"
          label={t('queue.summary.average')}
          value={summary ? t('clinic.minutes', { count: summary.averageWaitMinutes }) : '—'}
          hint={
            summary && (
              <span className="inline-flex items-center gap-1">
                {summary.averageWaitMinutes > target && (
                  <AlertTriangle size={12} aria-hidden="true" />
                )}
                {t('queue.summary.target', { count: target })}
                {summary.averageWaitMinutes > target && ` · ${t('queue.overTarget')}`}
              </span>
            )
          }
        />
        <SummaryCard
          icon={<Hourglass size={20} />}
          tone="bg-error/10 text-error"
          label={t('queue.summary.longest')}
          value={summary ? t('clinic.minutes', { count: summary.longestWaitMinutes }) : '—'}
          hint={
            summary?.longestWaitNumber ? (
              <span dir="ltr">
                {t('queue.summary.queueNumber', { number: summary.longestWaitNumber })}
              </span>
            ) : undefined
          }
        />
        <SummaryCard
          icon={<CheckCheck size={20} />}
          tone="bg-info/10 text-info"
          label={t('queue.summary.checkedIn')}
          value={summary ? fmt.number(summary.checkedInToday) : '—'}
          hint={summary && t('queue.summary.completed', { count: summary.completedToday })}
        />
      </div>

      <section
        aria-label={t('queue.liveTitle')}
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-(--shadow-card)"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">{t('queue.liveTitle')}</h2>
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs text-muted"
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${isError ? 'bg-error' : 'bg-success'}`}
            />
            {isError
              ? t('queue.updatedFailed')
              : ageSeconds < 15
                ? t('queue.updatedNow')
                : t('queue.updatedAgo', { seconds: Math.round(ageSeconds / 5) * 5 })}
          </p>
        </header>
        {isError && data && (
          <p
            role="alert"
            className="border-b border-border bg-error/10 px-4 py-2 text-sm text-error"
          >
            {t('queue.error.stale')}{' '}
            <button type="button" className="font-medium underline" onClick={() => void refetch()}>
              {t('clinic.retry')}
            </button>
          </p>
        )}
        {list}
      </section>

      <SelfCheckInPanel />

      <CheckInModal
        open={pickerOpen}
        expected={data?.expected ?? []}
        busy={checkingIn}
        onClose={() => setPickerOpen(false)}
        onCheckIn={(appointmentId, priority) =>
          void run(async () => {
            await checkIn({ appointmentId, priority }).unwrap();
            setPickerOpen(false);
          }, t('queue.toast.checkedIn'))
        }
      />

      <Modal
        open={delayFor !== null}
        title={t('queue.delay.title', { number: delayFor?.number ?? '' })}
        onClose={() => setDelayFor(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDelayFor(null)} disabled={notifying}>
              {t('clinic.cancel')}
            </Button>
            <Button onClick={() => void submitDelay()} disabled={notifying}>
              {t('queue.delay.send')}
            </Button>
          </>
        }
      >
        <Field label={t('queue.delay.minutes')} help={t('queue.delay.help')}>
          <Input
            type="number"
            min={1}
            max={240}
            dir="ltr"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
