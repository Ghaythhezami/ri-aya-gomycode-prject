import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import type { PortalAppointment, PortalDoctor } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Textarea } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import {
  useAppointmentTypesQuery,
  useBookMutation,
  useDoctorsQuery,
  type PortalAppointmentType,
} from '../api';
import { appointmentIcs } from '../components/AppointmentCard';
import { SlotPicker } from '../components/SlotPicker';
import { ButtonLink, Card, Initials, Notice, PageTitle } from '../components/ui';
import { conflictAlternatives, isSlotConflict } from '../lib/conflict';
import { downloadIcs } from '../lib/ics';
import { portalErrorMessage } from '../lib/session';
import { dateInZone } from '../lib/slots';
import { usePortalFormat } from '../lib/useFormat';
import { usePortalAuth, usePortalMe } from '../PortalAuthContext';

const STEPS = ['doctor', 'type', 'time', 'reason', 'review'] as const;
type Step = (typeof STEPS)[number];

const isEmergency = (type: PortalAppointmentType) => type.type.toUpperCase() === 'EMERGENCY';

export function PortalBookPage() {
  const { t } = useTranslation();
  const me = usePortalMe();
  const { timeZone } = usePortalAuth();
  const format = usePortalFormat();

  const [step, setStep] = useState<Step>('doctor');
  const [specialty, setSpecialty] = useState('');
  const [doctor, setDoctor] = useState<PortalDoctor | null>(null);
  const [type, setType] = useState<PortalAppointmentType | null>(null);
  const [date, setDate] = useState(() => dateInZone(new Date(), timeZone));
  const [startsAt, setStartsAt] = useState('');
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<PortalAppointment | null>(null);
  const [problem, setProblem] = useState<{ message: string; alternatives: string[] } | null>(null);

  const doctors = useDoctorsQuery();
  const types = useAppointmentTypesQuery();
  const [book, { isLoading: booking }] = useBookMutation();

  const specialties = useMemo(
    () => [...new Set((doctors.data ?? []).map((d) => d.specialty).filter(Boolean))].sort(),
    [doctors.data],
  );
  const visibleDoctors = (doctors.data ?? []).filter(
    (d) => !specialty || d.specialty === specialty,
  );
  const visibleTypes = (types.data ?? []).filter((x) => !isEmergency(x));
  const index = STEPS.indexOf(step);

  async function confirm() {
    if (!doctor || !type || !startsAt) return;
    setProblem(null);
    try {
      const created = await book({
        doctorId: doctor.id,
        type: type.type,
        startsAt,
        reason: reason.trim() || undefined,
      }).unwrap();
      setBooked(created);
    } catch (e) {
      const wrapped = { response: { data: (e as { data?: unknown }).data } };
      if (isSlotConflict(wrapped)) {
        setProblem({
          message: t('portal.booking.conflict'),
          alternatives: conflictAlternatives(wrapped).map((s) => s.startsAt),
        });
      } else {
        setProblem({
          message: portalErrorMessage(wrapped, t('portal.booking.failed')),
          alternatives: [],
        });
      }
    }
  }

  if (booked) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="text-center">
          <CheckCircle2 size={48} className="mx-auto text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-semibold text-text">
            {t('portal.booking.successTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(me.verified ? 'portal.booking.successBody' : 'portal.booking.successBodyUnverified')}
          </p>
          <dl className="mt-5 space-y-2 rounded-md bg-bg p-4 text-start text-sm">
            <Row label={t('portal.booking.doctor')} value={booked.doctor.name} />
            <Row label={t('portal.booking.type')} value={booked.typeName} />
            <Row label={t('portal.booking.when')} value={format.dateTime(booked.startsAt)} />
            <Row label={t('portal.booking.where')} value={me.clinicName} />
            <Row label={t('portal.booking.code')} value={booked.code} />
          </dl>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="secondary"
              onClick={() =>
                downloadIcs(
                  appointmentIcs(
                    booked,
                    me.clinicName,
                    t('portal.calendar.title', { doctor: booked.doctor.name }),
                  ),
                  `appointment-${booked.code}.ics`,
                )
              }
            >
              <CalendarPlus size={16} aria-hidden />
              {t('portal.calendar.add')}
            </Button>
            <ButtonLink to="/portal/appointments">
              {t('portal.booking.viewAppointments')}
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={t('portal.booking.title')} description={t('portal.booking.subtitle')} />
      <ol className="mb-5 flex gap-1.5" aria-label={t('portal.booking.progress')}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === step ? 'step' : undefined}
            className={`flex-1 rounded-full py-1 text-center text-xs ${
              s === step
                ? 'bg-primary font-semibold text-white'
                : i < index
                  ? 'bg-accent text-primary'
                  : 'bg-surface text-muted'
            }`}
          >
            <span aria-hidden>{i < index ? '✓' : i + 1}</span>
            <span className="sr-only">
              {t('portal.booking.stepOf', { current: i + 1, total: STEPS.length })}:{' '}
              {t(`portal.booking.steps.${s}`)}
            </span>
          </li>
        ))}
      </ol>

      <Card aria-labelledby="book-step">
        <h2 id="book-step" className="mb-4 text-lg font-semibold text-text">
          {t(`portal.booking.steps.${step}`)}
        </h2>

        {step === 'doctor' ? (
          doctors.isLoading ? (
            <div aria-busy="true" className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : doctors.isError ? (
            <ErrorState
              title={t('portal.booking.doctorsError')}
              action={
                <Button variant="secondary" onClick={() => void doctors.refetch()}>
                  {t('portal.common.retry')}
                </Button>
              }
            />
          ) : (doctors.data ?? []).length === 0 ? (
            <EmptyState
              title={t('portal.booking.noDoctors')}
              description={t('portal.booking.noDoctorsHint')}
            />
          ) : (
            <div className="space-y-4">
              {specialties.length > 1 ? (
                <div
                  role="group"
                  aria-label={t('portal.booking.specialty')}
                  className="flex flex-wrap gap-2"
                >
                  {['', ...specialties].map((s) => (
                    <button
                      key={s || 'all'}
                      type="button"
                      aria-pressed={specialty === s}
                      onClick={() => setSpecialty(s)}
                      className={`min-h-10 rounded-full border px-3 text-sm ${
                        specialty === s
                          ? 'border-primary bg-primary text-white'
                          : 'border-border-strong bg-surface text-text'
                      }`}
                    >
                      {s || t('portal.booking.allSpecialties')}
                    </button>
                  ))}
                </div>
              ) : null}
              <div role="radiogroup" aria-labelledby="book-step" className="space-y-2">
                {visibleDoctors.map((d) => (
                  <label
                    key={d.id}
                    className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-md border p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                      doctor?.id === d.id ? 'border-primary bg-accent' : 'border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="doctor"
                      className="size-5 accent-primary"
                      checked={doctor?.id === d.id}
                      onChange={() => {
                        setDoctor(d);
                        setStartsAt('');
                      }}
                    />
                    <Initials value={d.initials} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">{d.name}</span>
                      <span className="block truncate text-xs text-muted">{d.specialty}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        ) : null}

        {step === 'type' ? (
          types.isLoading ? (
            <Skeleton lines={3} />
          ) : types.isError ? (
            <ErrorState
              title={t('portal.booking.typesError')}
              action={
                <Button variant="secondary" onClick={() => void types.refetch()}>
                  {t('portal.common.retry')}
                </Button>
              }
            />
          ) : visibleTypes.length === 0 ? (
            <EmptyState title={t('portal.booking.noTypes')} />
          ) : (
            <div className="space-y-3">
              <div role="radiogroup" aria-labelledby="book-step" className="space-y-2">
                {visibleTypes.map((x) => (
                  <label
                    key={x.type}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                      type?.type === x.type ? 'border-primary bg-accent' : 'border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      className="size-5 accent-primary"
                      checked={type?.type === x.type}
                      onChange={() => setType(x)}
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-text">{x.name}</span>
                    {x.durationMinutes ? (
                      <span className="text-xs text-muted">
                        {t('portal.booking.minutes', { count: x.durationMinutes })}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
              <Notice tone="info">{t('portal.booking.emergencyNote')}</Notice>
            </div>
          )
        ) : null}

        {step === 'time' && doctor ? (
          <SlotPicker
            doctorId={doctor.id}
            date={date}
            onDateChange={(d) => {
              setDate(d);
              setStartsAt('');
            }}
            value={startsAt}
            onSelect={(s) => setStartsAt(s.startsAt)}
            timeZone={timeZone}
            durationMinutes={type?.durationMinutes}
          />
        ) : null}

        {step === 'reason' ? (
          <Field label={t('portal.booking.reasonLabel')} help={t('portal.booking.reasonHelp')}>
            <Textarea
              value={reason}
              maxLength={300}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        ) : null}

        {step === 'review' && doctor && type ? (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-md bg-bg p-4 text-sm">
              <Row
                label={t('portal.booking.doctor')}
                value={`${doctor.name} (${doctor.specialty})`}
              />
              <Row label={t('portal.booking.type')} value={type.name} />
              <Row
                label={t('portal.booking.when')}
                value={startsAt ? format.dateTime(startsAt) : '-'}
              />
              <Row label={t('portal.booking.where')} value={me.clinicName} />
              {reason.trim() ? (
                <Row label={t('portal.booking.reasonLabel')} value={reason.trim()} />
              ) : null}
            </dl>
            {problem ? (
              <div className="space-y-2">
                <Notice tone="error">{problem.message}</Notice>
                {problem.alternatives.length ? (
                  <div>
                    <p className="mb-1 text-sm font-medium text-text">
                      {t('portal.booking.alternatives')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {problem.alternatives.map((iso) => (
                        <Button
                          key={iso}
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setStartsAt(iso);
                            setDate(dateInZone(iso, timeZone));
                            setProblem(null);
                          }}
                        >
                          {format.dateTime(iso)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartsAt('');
                    setProblem(null);
                    setStep('time');
                  }}
                >
                  {t('portal.booking.pickAnother')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            disabled={index === 0 || booking}
            onClick={() => {
              setProblem(null);
              setStep(STEPS[Math.max(index - 1, 0)]!);
            }}
          >
            {t('portal.common.back')}
          </Button>
          {step === 'review' ? (
            <Button size="lg" disabled={booking || !startsAt} onClick={() => void confirm()}>
              {booking ? t('portal.booking.confirming') : t('portal.booking.confirm')}
            </Button>
          ) : (
            <Button
              disabled={
                (step === 'doctor' && !doctor) ||
                (step === 'type' && !type) ||
                (step === 'time' && !startsAt)
              }
              onClick={() => {
                // A single available type needs no choice.
                if (step === 'doctor' && !type && visibleTypes.length === 1)
                  setType(visibleTypes[0]!);
                setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]!);
              }}
            >
              {t('portal.common.next')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-text">{value}</dd>
    </div>
  );
}
