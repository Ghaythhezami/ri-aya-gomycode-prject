import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, type Resolver } from 'react-hook-form';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type {
  AlternativeSlot,
  AppointmentDetail,
  CreateAppointmentInput,
  SlotDto,
} from '@riaya/shared';
import { Button } from '../../common/Button';
import { asClinicError } from '../../store/clinicApi';
import { todayInZone, zonedParts } from '../calendar/dates';
import { useClinicReferenceQuery } from '../shared/api';
import { durationForType, useAppointmentTypesQuery } from '../shared/appointmentTypes';
import { useClinicFormat } from '../shared/format';
import {
  useBookCreateMutation,
  useBookDoctorQuery,
  useBookLockMutation,
  useBookPatientQuery,
  useBookUnlockMutation,
} from './api';
import { closeBooking, useBookingRequest, type BookingRequest } from './booking-launcher';
import { DateTimeStep } from './DateTimeStep';
import { DetailsStep } from './DetailsStep';
import { DoctorStep, toDoctorChoice } from './DoctorStep';
import { PatientStep } from './PatientStep';
import { ReviewStep } from './ReviewStep';
import {
  STEPS,
  clearDraft,
  emptyForm,
  maskPhone,
  readDraft,
  validateStep,
  writeDraft,
  type BookingForm,
  type StepId,
} from './schema';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface HeldLock {
  token: string;
  startsAt: string;
  durationMinutes: number;
  doctorId: string;
}

/**
 * Guided booking wizard (APP-3): Patient, Doctor, Date and time, Details, Review.
 *
 * The shell renders it once; it appears when `openBooking()` is called. Each step is
 * validated with zod before Next, Back keeps every value, and the draft survives a
 * dismissed dialog for the rest of the browser session. A slot is held with a lock
 * as soon as it is picked and released on change, close or cancel.
 */
export function BookingWizard() {
  const request = useBookingRequest();
  if (!request) return null;
  return createPortal(<BookingDialog request={request} />, document.body);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function BookingDialog({ request }: { request: BookingRequest }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const format = useClinicFormat();
  const reference = useClinicReferenceQuery();
  const today = todayInZone(format.timeZone);
  const typesQuery = useAppointmentTypesQuery();
  const types = typesQuery.data;
  const durationFor = useCallback(
    (type: string) => durationForType(types, type, reference.data?.durations?.[type] ?? 30),
    [types, reference.data?.durations],
  );

  const draft = useMemo(() => readDraft(), []);
  const [step, setStep] = useState(draft?.step ?? 0);
  const stepRef = useRef(step);
  stepRef.current = step;

  const resolver = useCallback<Resolver<BookingForm>>(async (values) => {
    const errors = validateStep(STEPS[stepRef.current] ?? 'review', values);
    if (!errors) return { values, errors: {} };
    return {
      values: {},
      errors: Object.fromEntries(
        Object.entries(errors).map(([key, message]) => [key, { type: 'validation', message }]),
      ),
    };
  }, []);

  const form = useForm<BookingForm>({
    defaultValues: draft?.form ?? emptyForm({ duration: durationFor('CONSULTATION') }),
    resolver,
  });
  const values = form.watch();
  const errors = form.formState.errors as Partial<Record<keyof BookingForm, { message?: string }>>;

  const [lockMutation] = useBookLockMutation();
  const [unlockMutation] = useBookUnlockMutation();
  const [createAppointment, creation] = useBookCreateMutation();
  const lockRef = useRef<HeldLock | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [slotWarning, setSlotWarning] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AlternativeSlot[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<AppointmentDetail | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = 'booking-title';

  // ---- locks -----------------------------------------------------------

  const releaseLock = useCallback(() => {
    const held = lockRef.current;
    lockRef.current = null;
    if (held)
      void unlockMutation(held.token)
        .unwrap()
        .catch(() => undefined);
  }, [unlockMutation]);

  /** Holds the slot for the doctor; resolves false (and warns) when it cannot. */
  const acquireLock = useCallback(
    async (doctorId: string, startsAt: string, durationMinutes: number): Promise<boolean> => {
      const held = lockRef.current;
      if (
        held &&
        held.doctorId === doctorId &&
        held.startsAt === startsAt &&
        held.durationMinutes === durationMinutes
      ) {
        return true;
      }
      releaseLock();
      setLockBusy(true);
      setSlotWarning(null);
      try {
        const lock = await lockMutation({ doctorId, startsAt, durationMinutes }).unwrap();
        lockRef.current = { token: lock.lockToken, startsAt, durationMinutes, doctorId };
        return true;
      } catch (raw) {
        const error = asClinicError(raw);
        setSlotWarning(
          error?.code === 'SLOT_LOCKED'
            ? t('booking.datetime.locked')
            : t(`errors.${error?.code ?? 'generic'}`, { defaultValue: error?.message }),
        );
        return false;
      } finally {
        setLockBusy(false);
      }
    },
    [lockMutation, releaseLock, t],
  );

  // Release the slot when the dialog unmounts.
  useEffect(() => releaseLock, [releaseLock]);

  // ---- preselection from openBooking() -----------------------------------

  const patientQuery = useBookPatientQuery(request.patientId ?? '', { skip: !request.patientId });
  const doctorQuery = useBookDoctorQuery(request.doctorId ?? '', { skip: !request.doctorId });
  const applied = useRef({ patient: false, doctor: false, slot: false });

  useEffect(() => {
    const patient = patientQuery.data;
    if (!patient || applied.current.patient) return;
    applied.current.patient = true;
    form.setValue('patient', {
      id: patient.id,
      name: patient.name,
      code: patient.code,
      initials: patient.initials,
      phoneMasked: maskPhone(patient.phone),
    });
    setStep((current) => (current === 0 ? 1 : current));
  }, [patientQuery.data, form]);

  useEffect(() => {
    const doctor = doctorQuery.data;
    if (!doctor || applied.current.doctor) return;
    applied.current.doctor = true;
    form.setValue('doctor', toDoctorChoice(doctor));
    form.setValue('specialty', doctor.specialty);
    setStep((current) => (current === 1 ? 2 : current));
  }, [doctorQuery.data, form]);

  useEffect(() => {
    if (!request.startsAt || applied.current.slot) return;
    applied.current.slot = true;
    form.setValue('date', zonedParts(request.startsAt, format.timeZone).ymd);
    form.setValue('startsAt', request.startsAt);
  }, [request.startsAt, form, format.timeZone]);

  // A restored or preselected slot is held again once its doctor is known. Slots the
  // user picks in this session are locked by `chooseSlot`, never here.
  const restoring = useRef(Boolean(draft?.form.startsAt || request.startsAt));
  useEffect(() => {
    if (created || !restoring.current || !values.doctor || !values.startsAt) return;
    restoring.current = false;
    void acquireLock(values.doctor.id, values.startsAt, values.durationMinutes).then((ok) => {
      if (!ok) form.setValue('startsAt', '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.doctor?.id, values.startsAt, created]);

  // ---- draft -------------------------------------------------------------

  useEffect(() => {
    if (created) return;
    writeDraft({ step, form: values });
  }, [step, values, created]);

  // ---- dialog behaviour --------------------------------------------------

  const dismiss = useCallback(() => {
    releaseLock();
    closeBooking();
  }, [releaseLock]);

  function cancelBooking() {
    releaseLock();
    clearDraft();
    closeBooking();
  }

  useEffect(() => {
    const panel = panelRef.current;
    const restore = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const previousHidden = root?.getAttribute('aria-hidden') ?? null;
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (focusables()[1] ?? focusables()[0] ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !panel?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previousHidden === null) root?.removeAttribute('aria-hidden');
      else root?.setAttribute('aria-hidden', previousHidden);
      restore?.focus();
    };
  }, [dismiss]);

  // ---- navigation --------------------------------------------------------

  const stepId: StepId = STEPS[step] ?? 'review';
  const bodyRef = useRef<HTMLDivElement>(null);

  function goTo(next: number) {
    setConflict(null);
    setSubmitError(null);
    setStep(next);
    form.clearErrors();
    bodyRef.current?.scrollTo?.({ top: 0 });
  }

  async function next() {
    const valid = await form.trigger();
    if (!valid) return;
    const current = form.getValues();

    if ((stepId === 'datetime' || stepId === 'details') && current.doctor) {
      const held = await acquireLock(current.doctor.id, current.startsAt, current.durationMinutes);
      if (!held) {
        form.setValue('startsAt', '');
        goTo(2);
        return;
      }
    }
    goTo(step + 1);
  }

  function back() {
    goTo(Math.max(0, step - 1));
  }

  function chooseDoctor(doctor: NonNullable<BookingForm['doctor']>) {
    restoring.current = false;
    if (form.getValues('doctor')?.id !== doctor.id) {
      releaseLock();
      form.setValue('startsAt', '');
      setSlotWarning(null);
    }
    form.setValue('doctor', doctor, { shouldValidate: form.formState.isSubmitted });
    form.clearErrors('doctor');
  }

  function chooseDate(ymd: string) {
    restoring.current = false;
    if (form.getValues('date') === ymd) return;
    releaseLock();
    setSlotWarning(null);
    form.setValue('date', ymd);
    form.setValue('startsAt', '');
  }

  async function chooseSlot(slot: SlotDto) {
    restoring.current = false;
    const doctor = form.getValues('doctor');
    if (!doctor) return;
    form.setValue('startsAt', slot.startsAt);
    form.clearErrors('startsAt');
    const ok = await acquireLock(doctor.id, slot.startsAt, form.getValues('durationMinutes'));
    if (!ok) form.setValue('startsAt', '');
  }

  async function pickAlternative(slot: AlternativeSlot) {
    restoring.current = false;
    const current = form.getValues('doctor');
    if (!current) return;
    setConflict(null);
    setSubmitError(null);
    if (slot.doctorId !== current.id) {
      form.setValue('doctor', {
        ...current,
        id: slot.doctorId,
        name: slot.doctorName,
        initials: initialsOf(slot.doctorName),
      });
    }
    form.setValue('date', zonedParts(slot.startsAt, format.timeZone).ymd);
    form.setValue('startsAt', slot.startsAt);
    const ok = await acquireLock(slot.doctorId, slot.startsAt, form.getValues('durationMinutes'));
    if (!ok) {
      form.setValue('startsAt', '');
      goTo(2);
    }
  }

  async function confirm() {
    const current = form.getValues();
    if (!current.patient || !current.doctor || !current.startsAt) return;
    setSubmitError(null);
    setConflict(null);

    const input: CreateAppointmentInput = {
      patientId: current.patient.id,
      doctorId: current.doctor.id,
      startsAt: current.startsAt,
      type: current.type,
      durationMinutes: current.durationMinutes,
      ...(current.reason.trim() ? { reason: current.reason.trim() } : {}),
      ...(current.notes.trim() ? { notes: current.notes.trim() } : {}),
      reminderChannels: current.reminderChannels,
      ...(lockRef.current ? { lockToken: lockRef.current.token } : {}),
    };

    try {
      const result = await createAppointment(input).unwrap();
      lockRef.current = null; // consumed by the API
      clearDraft();
      setCreated(result);
    } catch (raw) {
      const error = asClinicError(raw);
      if (error?.code === 'SLOT_CONFLICT') {
        lockRef.current = null;
        const alternatives = (error.details as { alternatives?: AlternativeSlot[] } | undefined)
          ?.alternatives;
        setConflict((alternatives ?? []).slice(0, 3));
        return;
      }
      setSubmitError(t(`errors.${error?.code ?? 'generic'}`, { defaultValue: error?.message }));
    }
  }

  function bookAnother() {
    form.reset(emptyForm({ duration: durationFor('CONSULTATION') }));
    clearDraft();
    setCreated(null);
    setConflict(null);
    setSubmitError(null);
    setSlotWarning(null);
    setStep(0);
  }

  function viewCreated() {
    if (!created) return;
    closeBooking();
    navigate(`/appointments/${created.id}`);
  }

  // ---- render ------------------------------------------------------------

  const isReview = stepId === 'review';
  const confirming = creation.isLoading;
  const locale = i18n.resolvedLanguage ?? 'en';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('clinic.close')}
        className="absolute inset-0 bg-navy/40"
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface shadow-(--shadow-overlay) sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t('booking.eyebrow')}
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-text">
              {t('booking.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('clinic.close')}
            className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {created ? (
          <div className="flex-1 overflow-y-auto px-5 py-10 text-center sm:px-6">
            <span
              aria-hidden="true"
              className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success"
            >
              <Check size={28} />
            </span>
            <h3 role="status" className="mt-4 text-lg font-semibold text-text">
              {t('booking.success.title')}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {t('booking.success.body', {
                code: created.code,
                patient: created.patient.name,
                doctor: created.doctor.name,
                when: format.dateTime(created.startsAt),
              })}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={bookAnother}>
                {t('booking.success.another')}
              </Button>
              <Button onClick={viewCreated}>{t('booking.success.view')}</Button>
            </div>
          </div>
        ) : (
          <>
            <nav
              aria-label={t('booking.stepsLabel')}
              className="border-b border-border bg-bg px-5 py-3 sm:px-6"
            >
              <ol className="flex items-center gap-2">
                {STEPS.map((id, index) => {
                  const done = index < step;
                  const current = index === step;
                  return (
                    <li
                      key={id}
                      aria-current={current ? 'step' : undefined}
                      className={`flex items-center gap-2 ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                          done || current
                            ? 'bg-primary text-white'
                            : 'border border-border-strong bg-surface text-muted'
                        }`}
                      >
                        {done ? <Check size={14} aria-hidden="true" /> : index + 1}
                      </span>
                      <span
                        className={`text-xs font-medium ${current ? 'text-text' : 'text-muted'} ${
                          current ? '' : 'hidden sm:inline'
                        }`}
                      >
                        <span className="sr-only">
                          {done
                            ? t('booking.stepDone')
                            : current
                              ? t('booking.stepCurrent')
                              : ''}{' '}
                        </span>
                        {t(`booking.steps.${id}`)}
                      </span>
                      {index < STEPS.length - 1 ? (
                        <span aria-hidden="true" className="h-px flex-1 bg-border-strong/40" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-xs text-muted sm:hidden" aria-hidden="true">
                {t('booking.stepOf', { current: step + 1, total: STEPS.length })}
              </p>
            </nav>

            <div
              ref={bodyRef}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:min-h-[26rem] sm:px-6"
            >
              {stepId === 'patient' ? (
                <PatientStep
                  value={values.patient}
                  error={errors.patient?.message}
                  onChange={(patient) => {
                    form.setValue('patient', patient);
                    form.clearErrors('patient');
                  }}
                />
              ) : null}
              {stepId === 'doctor' ? (
                <DoctorStep
                  value={values.doctor}
                  specialty={values.specialty}
                  date={today}
                  error={errors.doctor?.message}
                  onSpecialty={(specialty) => form.setValue('specialty', specialty)}
                  onChange={chooseDoctor}
                />
              ) : null}
              {stepId === 'datetime' && values.doctor ? (
                <DateTimeStep
                  doctor={values.doctor}
                  date={values.date}
                  startsAt={values.startsAt}
                  durationMinutes={values.durationMinutes}
                  today={today}
                  locale={locale}
                  error={errors.startsAt?.message ?? errors.date?.message}
                  warning={slotWarning}
                  busy={lockBusy}
                  onDate={chooseDate}
                  onSlot={(slot) => void chooseSlot(slot)}
                />
              ) : null}
              {stepId === 'details' ? (
                <DetailsStep
                  control={form.control}
                  register={form.register}
                  errors={errors}
                  duration={values.durationMinutes}
                  durationFor={durationFor}
                  types={types}
                  typesLoading={typesQuery.isLoading}
                  typesError={typesQuery.isError}
                  onRetryTypes={() => void typesQuery.refetch()}
                  onType={(_, duration) => form.setValue('durationMinutes', duration)}
                />
              ) : null}
              {isReview ? (
                <ReviewStep
                  form={values}
                  conflict={conflict}
                  error={submitError}
                  onPickAlternative={(slot) => void pickAlternative(slot)}
                />
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-4 sm:px-6">
              <div className="flex gap-2">
                {step > 0 ? (
                  <Button variant="secondary" onClick={back} disabled={confirming}>
                    <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                    {t('clinic.back')}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={cancelBooking} disabled={confirming}>
                  {t('clinic.cancel')}
                </Button>
              </div>
              {isReview ? (
                <Button
                  onClick={() => void confirm()}
                  disabled={confirming || conflict !== null}
                  aria-busy={confirming || undefined}
                >
                  {t('booking.confirm')}
                </Button>
              ) : (
                <Button onClick={() => void next()} disabled={lockBusy}>
                  {t('clinic.next')}
                  <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                </Button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
