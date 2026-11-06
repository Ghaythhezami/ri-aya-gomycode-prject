import { useTranslation } from 'react-i18next';
import { Check, Clock3, Stethoscope } from 'lucide-react';
import type { DoctorAvailability, DoctorCard } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { Avatar } from '../shared/Avatar';
import { useBookDoctorsQuery, useBookSpecialtiesQuery } from './api';
import type { DoctorChoice } from './schema';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

const AVAILABILITY_TONE: Record<DoctorAvailability, string> = {
  AVAILABLE: 'bg-success/10 text-success',
  IN_CONSULTATION: 'bg-info/10 text-info',
  ON_BREAK: 'bg-warning/10 text-warning',
  ON_LEAVE: 'bg-error/10 text-error',
  OFF_DUTY: 'bg-muted/10 text-muted',
  INACTIVE: 'bg-muted/10 text-muted',
};

export function toDoctorChoice(doctor: DoctorCard): DoctorChoice {
  return {
    id: doctor.id,
    name: doctor.name,
    initials: doctor.initials,
    specialty: doctor.specialty,
    consultationMinutes: doctor.consultationMinutes,
  };
}

export function DoctorStep({
  value,
  specialty,
  date,
  error,
  onSpecialty,
  onChange,
}: {
  value: DoctorChoice | null;
  specialty: string;
  /** Clinic-local today, used for the availability badge. */
  date: string;
  error?: string;
  onSpecialty: (specialty: string) => void;
  onChange: (doctor: DoctorChoice) => void;
}) {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const specialties = useBookSpecialtiesQuery();
  const doctors = useBookDoctorsQuery({ date, specialty: specialty || undefined });
  const list = doctors.data ?? [];

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-text">{t('booking.doctor.title')}</h3>

      <Field label={t('booking.doctor.specialty')}>
        <Select value={specialty} onChange={(event) => onSpecialty(event.target.value)}>
          <option value="">{t('booking.doctor.allSpecialties')}</option>
          {(specialties.data ?? []).map((name) => (
            <option key={name} value={name}>
              {specialtyLabel(name)}
            </option>
          ))}
        </Select>
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {t(error)}
        </p>
      ) : null}

      <div aria-live="polite" aria-busy={doctors.isFetching}>
        {doctors.isError ? (
          <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm">
            <p className="text-error">{t('booking.doctor.error')}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void doctors.refetch()}
            >
              {t('clinic.retry')}
            </Button>
          </div>
        ) : doctors.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            {t('booking.doctor.empty')}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('booking.doctor.listLabel')}>
            {list.map((doctor) => {
              const selected = value?.id === doctor.id;
              const unavailable = !doctor.isActive || doctor.availability === 'INACTIVE';
              return (
                <li key={doctor.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={unavailable}
                    onClick={() => onChange(toDoctorChoice(doctor))}
                    className={`flex h-full w-full flex-col gap-3 rounded-lg border p-4 text-start transition disabled:opacity-60 ${
                      selected ? 'border-primary bg-accent' : 'border-border bg-surface hover:bg-bg'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Avatar initials={doctor.initials} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">
                          {doctor.name}
                        </span>
                        <span className="flex items-center gap-1 truncate text-xs text-muted">
                          <Stethoscope size={12} aria-hidden="true" />
                          {specialtyLabel(doctor.specialty)}
                        </span>
                      </span>
                      {selected ? (
                        <Check size={18} aria-hidden="true" className="text-primary" />
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex min-h-7 items-center rounded-full px-2.5 font-medium ${AVAILABILITY_TONE[doctor.availability]}`}
                      >
                        {t(`booking.availability.${doctor.availability}`)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Clock3 size={12} aria-hidden="true" />
                        {t('clinic.minutes', { count: doctor.consultationMinutes })}
                      </span>
                      {doctor.hoursLabel ? (
                        <span dir="ltr" className="text-muted">
                          {doctor.hoursLabel}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
