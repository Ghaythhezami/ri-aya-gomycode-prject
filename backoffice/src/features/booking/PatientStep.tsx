import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Check, Search, UserPlus } from 'lucide-react';
import type { CreatePatientInput, PatientDetail, PatientListItem } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { asClinicError } from '../../store/clinicApi';
import { Avatar } from '../shared/Avatar';
import { useDebounced } from '../search/useDebounced';
import { useBookCreatePatientMutation, useBookPatientsQuery } from './api';
import { maskPhone, type PatientChoice } from './schema';

export function toChoice(patient: PatientListItem): PatientChoice {
  return {
    id: patient.id,
    name: patient.name,
    code: patient.code,
    initials: patient.initials,
    phoneMasked: patient.phoneMasked,
  };
}

function detailToChoice(patient: PatientDetail): PatientChoice {
  return {
    id: patient.id,
    name: patient.name,
    code: patient.code,
    initials: patient.initials,
    phoneMasked: maskPhone(patient.phone),
  };
}

const newPatientSchema = z.object({
  firstName: z.string().trim().min(1, 'booking.patient.errors.firstName'),
  lastName: z.string().trim().min(1, 'booking.patient.errors.lastName'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'booking.patient.errors.dateOfBirth')
    .refine((value) => value <= new Date().toISOString().slice(0, 10), {
      message: 'booking.patient.errors.dateOfBirth',
    }),
  phone: z.string().trim().min(6, 'booking.patient.errors.phone'),
  email: z.union([z.literal(''), z.email('booking.patient.errors.email')]),
  gender: z.enum(['', 'female', 'male']),
});
type NewPatientValues = z.infer<typeof newPatientSchema>;

function PatientRow({
  patient,
  selected,
  onSelect,
}: {
  patient: PatientChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-16 w-full items-center gap-3 rounded-lg border px-4 py-2 text-start transition ${
        selected ? 'border-primary bg-accent' : 'border-border bg-surface hover:bg-bg'
      }`}
    >
      <Avatar initials={patient.initials} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold ${selected ? 'text-primary' : 'text-text'}`}
        >
          {patient.name}
        </span>
        <span className="block truncate text-xs text-muted">
          <span dir="ltr">{patient.code}</span> · <span dir="ltr">{patient.phoneMasked}</span>
        </span>
      </span>
      {selected ? <Check size={18} aria-hidden="true" className="text-primary" /> : null}
    </button>
  );
}

function NewPatientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (patient: PatientChoice) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [createPatient, { isLoading }] = useBookCreatePatientMutation();
  const [duplicates, setDuplicates] = useState<PatientListItem[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<NewPatientValues>({
    resolver: zodResolver(newPatientSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phone: '',
      email: '',
      gender: '',
    },
  });

  async function submit(values: NewPatientValues, force: boolean) {
    setFormError(null);
    const input: CreatePatientInput = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      dateOfBirth: values.dateOfBirth,
      phone: values.phone.trim(),
      ...(values.email ? { email: values.email } : {}),
      ...(values.gender ? { gender: values.gender } : {}),
      ...(force ? { force: true } : {}),
    };
    try {
      const created = await createPatient(input).unwrap();
      onCreated(detailToChoice(created));
    } catch (raw) {
      const error = asClinicError(raw);
      if (error?.code === 'DUPLICATE_PATIENT') {
        const matches = (error.details as { matches?: PatientListItem[] } | undefined)?.matches;
        setDuplicates(matches ?? []);
        return;
      }
      setFormError(t(`errors.${error?.code ?? 'generic'}`, { defaultValue: error?.message }));
    }
  }

  return (
    <form
      noValidate
      aria-label={t('booking.patient.newTitle')}
      onSubmit={(event) => void handleSubmit((values) => submit(values, false))(event)}
      className="space-y-3 rounded-lg border border-border bg-bg p-4"
    >
      <h3 className="text-sm font-semibold text-text">{t('booking.patient.newTitle')}</h3>

      {duplicates ? (
        <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">{t('booking.patient.duplicateTitle')}</p>
          <p className="mt-1 text-sm text-text">{t('booking.patient.duplicateBody')}</p>
          <ul className="mt-2 space-y-2">
            {duplicates.map((match) => (
              <li key={match.id}>
                <PatientRow
                  patient={toChoice(match)}
                  selected={false}
                  onSelect={() => onCreated(toChoice(match))}
                />
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={isLoading}
            onClick={() => void submit(getValues(), true)}
          >
            {t('booking.patient.createAnyway')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('booking.patient.firstName')} error={errors.firstName?.message}>
          <Input autoComplete="off" {...register('firstName')} />
        </Field>
        <Field label={t('booking.patient.lastName')} error={errors.lastName?.message}>
          <Input autoComplete="off" {...register('lastName')} />
        </Field>
        <Field label={t('booking.patient.dateOfBirth')} error={errors.dateOfBirth?.message}>
          <Input type="date" dir="ltr" {...register('dateOfBirth')} />
        </Field>
        <Field label={t('booking.patient.gender')}>
          <Select {...register('gender')}>
            <option value="">{t('booking.patient.genderUnset')}</option>
            <option value="female">{t('booking.patient.female')}</option>
            <option value="male">{t('booking.patient.male')}</option>
          </Select>
        </Field>
        <Field label={t('booking.patient.phone')} error={errors.phone?.message}>
          <Input type="tel" dir="ltr" autoComplete="off" {...register('phone')} />
        </Field>
        <Field label={t('booking.patient.email')} error={errors.email?.message}>
          <Input type="email" dir="ltr" autoComplete="off" {...register('email')} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-error">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('clinic.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading} aria-busy={isLoading || undefined}>
          {t('booking.patient.create')}
        </Button>
      </div>
    </form>
  );
}

export function PatientStep({
  value,
  error,
  onChange,
}: {
  value: PatientChoice | null;
  error?: string;
  onChange: (patient: PatientChoice) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const search = useDebounced(query.trim(), 250);
  const { data, isFetching, isError, refetch } = useBookPatientsQuery({ search });

  const items = (data?.items ?? []).map(toChoice);
  // The chosen patient stays visible even when the current search no longer lists them.
  const rows = value && !items.some((item) => item.id === value.id) ? [value, ...items] : items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-text">{t('booking.patient.title')}</h3>
        {!creating ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(true)}>
            <UserPlus size={16} aria-hidden="true" />
            {t('booking.patient.new')}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <NewPatientForm
          onCancel={() => setCreating(false)}
          onCreated={(patient) => {
            setCreating(false);
            onChange(patient);
          }}
        />
      ) : (
        <>
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted"
            />
            <Input
              type="search"
              aria-label={t('booking.patient.searchLabel')}
              placeholder={t('booking.patient.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="ps-9"
              autoComplete="off"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-error">
              {t(error)}
            </p>
          ) : null}

          <div aria-live="polite" aria-busy={isFetching}>
            {isError ? (
              <div
                role="alert"
                className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm"
              >
                <p className="text-error">{t('booking.patient.searchError')}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => void refetch()}
                >
                  {t('clinic.retry')}
                </Button>
              </div>
            ) : isFetching && !data ? (
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                {search
                  ? t('booking.patient.noResults', { query: search })
                  : t('booking.patient.empty')}
              </p>
            ) : (
              <ul className="space-y-2" aria-label={t('booking.patient.listLabel')}>
                {rows.map((patient) => (
                  <li key={patient.id}>
                    <PatientRow
                      patient={patient}
                      selected={value?.id === patient.id}
                      onSelect={() => onChange(patient)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
