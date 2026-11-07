import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, CalendarPlus, ChevronLeft, Info, Mail, Pencil, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type {
  AppointmentListItem,
  DataLocale,
  PatientDetail,
  UpdatePatientInput,
} from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Field, Textarea } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Tabs } from '../../common/Tabs';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { openBooking } from '../booking/booking-launcher';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { StatusBadge } from '../shared/StatusBadge';
import {
  useArchivePatientMutation,
  usePatientAppointmentsQuery,
  usePatientQuery,
  useUpdatePatientMutation,
} from './api';
import { PortalStatusCard } from './PortalStatusCard';
import { SecondaryNames } from './SecondaryNames';
import { canonicalFor, toLocalizedValue, useClinicDefaultLanguage } from './names';
import { normalizeLocalized } from '@riaya/shared';
import { PatientFields, type PatientFieldGroup } from './PatientFields';
import { PatientStatusBadge, ageFromDob } from './PatientStatusBadge';
import { patientFormSchema, type PatientFormValues } from './schema';
import { canUser } from '../../auth/permissions';
import { DocumentsTab } from '../documents/DocumentsTab';
import { SummaryTab } from '../documents/SummaryTab';

function toFormValues(d: PatientDetail, defaultLanguage?: DataLocale): PatientFormValues {
  return {
    firstNameI18n: toLocalizedValue(d.firstNameI18n, d.firstName, defaultLanguage),
    lastNameI18n: toLocalizedValue(d.lastNameI18n, d.lastName, defaultLanguage),
    dateOfBirth: d.dateOfBirth.slice(0, 10),
    phone: d.phone,
    email: d.email ?? '',
    gender: d.gender === 'female' || d.gender === 'male' ? d.gender : '',
    address: d.address ?? '',
    contactPreference: d.contactPreference,
    adminNotes: d.adminNotes ?? '',
  };
}

/** Warn on tab close while a form has unsaved edits. */
function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

function SaveBar({
  dirty,
  saving,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
        {t('clinic.save')}
      </Button>
      {dirty && (
        <span role="status" className="inline-flex items-center gap-1.5 text-sm text-warning">
          <Info size={14} aria-hidden="true" />
          {t('patients.profile.unsaved')}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-error">
          {error}
        </span>
      )}
    </div>
  );
}

function useSave(id: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const [update, { isLoading }] = useUpdatePatientMutation();
  const [error, setError] = useState<string | null>(null);
  const save = async (body: UpdatePatientInput): Promise<boolean> => {
    setError(null);
    try {
      await update({ id, body }).unwrap();
      toast.success(t('patients.toast.saved'));
      return true;
    } catch (raw) {
      const e = asClinicError(raw);
      setError(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
      return false;
    }
  };
  return { save, isLoading, error };
}

function EditTab({ detail, groups }: { detail: PatientDetail; groups: PatientFieldGroup[] }) {
  const { t } = useTranslation();
  const { save, isLoading, error } = useSave(detail.id);
  const defaultLanguage = useClinicDefaultLanguage();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: toFormValues(detail, defaultLanguage),
  });
  useUnsavedWarning(isDirty);

  const submit = handleSubmit(async (values) => {
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(dirtyFields) as (keyof PatientFormValues)[]) {
      if (key === 'firstNameI18n' || key === 'lastNameI18n') {
        body[key] = normalizeLocalized(values[key]);
        const canonical = canonicalFor(values[key], defaultLanguage);
        if (canonical) body[key === 'firstNameI18n' ? 'firstName' : 'lastName'] = canonical;
        continue;
      }
      if (key === 'gender' && !values.gender) continue;
      body[key] = values[key].trim();
    }
    if (await save(body as UpdatePatientInput)) reset(values);
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label={t('patients.profile.editForm')}>
      <PatientFields register={register} control={control} errors={errors} groups={groups} />
      <SaveBar dirty={isDirty} saving={isLoading} error={error} />
    </form>
  );
}

interface NotesValues {
  adminNotes: string;
  clinicalNotes: string;
}

function NotesTab({ detail }: { detail: PatientDetail }) {
  const { t } = useTranslation();
  const { save, isLoading, error } = useSave(detail.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields },
  } = useForm<NotesValues>({
    defaultValues: {
      adminNotes: detail.adminNotes ?? '',
      clinicalNotes: detail.clinicalNotes ?? '',
    },
  });
  useUnsavedWarning(isDirty);
  const submit = handleSubmit(async (values) => {
    const body: UpdatePatientInput = {};
    if (dirtyFields.adminNotes) body.adminNotes = values.adminNotes;
    if (detail.canReadClinicalNotes && dirtyFields.clinicalNotes) {
      body.clinicalNotes = values.clinicalNotes;
    }
    if (await save(body)) reset(values);
  });
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <Field label={t('patients.fields.adminNotes')}>
        <Textarea rows={4} {...register('adminNotes')} />
      </Field>
      {detail.canReadClinicalNotes && (
        <section
          aria-label={t('patients.profile.clinicalNotes')}
          className="rounded-md border border-border bg-bg p-4"
        >
          <p className="mb-2 text-xs text-muted">{t('patients.profile.clinicalNotesHint')}</p>
          <Field label={t('patients.profile.clinicalNotes')}>
            <Textarea rows={5} {...register('clinicalNotes')} />
          </Field>
        </section>
      )}
      <SaveBar dirty={isDirty} saving={isLoading} error={error} />
    </form>
  );
}

function AppointmentRows({ items, empty }: { items: AppointmentListItem[]; empty: string }) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            to={`/appointments/${a.id}`}
            className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-bg"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">
                {fmt.dateTime(a.startsAt)} · {a.doctor.name}
              </p>
              <p className="text-xs text-muted">
                <span dir="ltr">{a.code}</span> · {t(`clinic.type.${a.type}`)}
                {a.reason ? ` · ${a.reason}` : ''}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PatientProfilePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useClinicFormat();
  const { data: patient, isLoading, isError, error, refetch } = usePatientQuery(id);
  const {
    data: appts,
    isError: apptsError,
    refetch: refetchAppts,
  } = usePatientAppointmentsQuery(id);
  const [archive, { isLoading: archiving }] = useArchivePatientMutation();
  const [tab, setTab] = useState('personal');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const canArchive = canUser(user, 'manageAppointments');
  const canClinical = canUser(user, 'readClinicalNotes');

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !patient) {
    const notFound = asClinicError(error)?.status === 404;
    return (
      <ErrorState
        title={notFound ? t('patients.profile.notFound') : t('patients.error.title')}
        description={notFound ? undefined : t('patients.error.body')}
        action={
          notFound ? (
            <Link to="/patients" className="text-sm font-medium text-primary underline">
              {t('patients.profile.backToList')}
            </Link>
          ) : (
            <Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>
          )
        }
      />
    );
  }

  const archived = patient.status === 'ARCHIVED';
  const apptTab = (items: AppointmentListItem[] | undefined, empty: string): ReactNode =>
    apptsError ? (
      <ErrorState
        title={t('patients.error.title')}
        action={<Button onClick={() => void refetchAppts()}>{t('clinic.retry')}</Button>}
      />
    ) : items ? (
      <AppointmentRows items={items} empty={empty} />
    ) : (
      <Skeleton className="h-32 w-full" />
    );

  const doArchive = async () => {
    try {
      await archive(patient.id).unwrap();
      toast.success(t('patients.toast.archived'));
      setConfirmArchive(false);
    } catch (raw) {
      const e = asClinicError(raw);
      toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/patients" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary">
        <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        {t('patients.profile.backToList')}
      </Link>
      {archived && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-border-strong bg-bg px-4 py-3 text-sm text-text"
        >
          <Archive size={16} aria-hidden="true" />
          {t('patients.profile.archivedBanner')}
        </p>
      )}
      <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
        <Avatar initials={patient.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-text">{patient.name}</h1>
          <SecondaryNames
            first={patient.firstNameI18n}
            last={patient.lastNameI18n}
            shown={patient.name}
          />
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span dir="ltr">{patient.code}</span>
            <span>{t('patients.profile.age', { count: ageFromDob(patient.dateOfBirth) })}</span>
            <PatientStatusBadge status={patient.status} />
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text">
            <span className="inline-flex items-center gap-1.5" dir="ltr">
              <Phone size={14} aria-hidden="true" className="text-muted" />
              {patient.phone}
            </span>
            {patient.email && (
              <span className="inline-flex items-center gap-1.5" dir="ltr">
                <Mail size={14} aria-hidden="true" className="text-muted" />
                {patient.email}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={archived} onClick={() => openBooking({ patientId: patient.id })}>
            <CalendarPlus size={16} aria-hidden="true" />
            {t('patients.schedule')}
          </Button>
          <Button variant="secondary" onClick={() => setTab('personal')}>
            <Pencil size={16} aria-hidden="true" />
            {t('patients.profile.edit')}
          </Button>
          {canArchive && !archived && (
            <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
              <Archive size={16} aria-hidden="true" />
              {t('patients.profile.archive')}
            </Button>
          )}
        </div>
      </header>
      {canArchive && <PortalStatusCard patientId={patient.id} />}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
        <Tabs
          label={t('patients.profile.tabs')}
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: 'personal',
              label: t('patients.profile.personal'),
              content: <EditTab detail={patient} groups={['identity', 'contact']} />,
            },
            {
              id: 'upcoming',
              label: t('patients.profile.upcoming'),
              count: appts?.upcoming.length,
              content: apptTab(appts?.upcoming, t('patients.profile.noUpcoming')),
            },
            {
              id: 'past',
              label: t('patients.profile.past'),
              count: appts?.past.length,
              content: apptTab(appts?.past, t('patients.profile.noPast')),
            },
            {
              id: 'notes',
              label: t('patients.profile.notes'),
              content: <NotesTab detail={patient} />,
            },
            ...(canClinical
              ? [
                  {
                    id: 'documents',
                    label: t('documents.tab'),
                    content: <DocumentsTab patientId={patient.id} />,
                  },
                  {
                    id: 'summary',
                    label: t('documents.summary.tab'),
                    content: <SummaryTab patientId={patient.id} />,
                  },
                ]
              : []),
            {
              id: 'contact',
              label: t('patients.profile.contactPreferences'),
              content: <EditTab detail={patient} groups={['preference']} />,
            },
          ]}
        />
        <p className="mt-4 text-xs text-muted">
          {t('patients.profile.registered', { date: fmt.date(patient.createdAt) })}
        </p>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        title={t('patients.profile.archiveTitle')}
        confirmLabel={t('patients.profile.archive')}
        cancelLabel={t('clinic.cancel')}
        tone="danger"
        loading={archiving}
        onConfirm={() => void doArchive()}
        onCancel={() => setConfirmArchive(false)}
      >
        {t('patients.profile.archiveBody', { name: patient.name })}
      </ConfirmDialog>
    </div>
  );
}
