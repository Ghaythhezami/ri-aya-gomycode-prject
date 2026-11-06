import type { ReactNode } from 'react';
import { CalendarPlus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { openBooking } from '../booking/booking-launcher';
import { usePatientAppointmentsQuery, usePatientQuery } from './api';
import { PatientStatusBadge } from './PatientStatusBadge';

/** Right-side preview of the selected patient (PAT-1). */
export function PatientPreview({ patientId }: { patientId: string | null }) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { data: patient, isLoading } = usePatientQuery(patientId ?? '', { skip: !patientId });
  const { data: appts } = usePatientAppointmentsQuery(patientId ?? '', { skip: !patientId });

  if (!patientId) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center px-6 text-center">
        <UserRound size={28} aria-hidden="true" className="text-muted" />
        <h2 className="mt-3 text-sm font-semibold text-text">{t('patients.preview.emptyTitle')}</h2>
        <p className="mt-1 text-xs text-muted">{t('patients.preview.emptyBody')}</p>
      </div>
    );
  }
  if (isLoading || !patient) {
    return (
      <div className="space-y-3 p-5" aria-busy="true">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton lines={4} />
      </div>
    );
  }
  const next = appts?.upcoming[0];
  return (
    <div className="space-y-4 p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        <Avatar initials={patient.initials} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-text">{patient.name}</h2>
          <p className="text-xs text-muted" dir="ltr">
            {patient.code}
          </p>
        </div>
      </div>
      <PatientStatusBadge status={patient.status} />
      <dl className="space-y-2 text-sm">
        <Row label={t('patients.fields.phone')}>
          <span dir="ltr">{patient.phone}</span>
        </Row>
        {patient.email && (
          <Row label={t('patients.fields.email')}>
            <span dir="ltr">{patient.email}</span>
          </Row>
        )}
        <Row label={t('patients.fields.dateOfBirth')}>{fmt.date(patient.dateOfBirth)}</Row>
        <Row label={t('patients.fields.contactPreference')}>
          {t(`patients.contact.${patient.contactPreference}`)}
        </Row>
      </dl>
      <div className="rounded-md border border-border bg-bg p-3">
        <p className="text-xs font-medium text-muted">{t('patients.preview.upcoming')}</p>
        {next ? (
          <p className="mt-1 text-sm text-text">
            {fmt.dateTime(next.startsAt)} · {next.doctor.name}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('patients.preview.noUpcoming')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to={`/patients/${patient.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
        >
          {t('patients.openProfile')}
        </Link>
        <Button
          variant="secondary"
          disabled={patient.status === 'ARCHIVED'}
          onClick={() => openBooking({ patientId: patient.id })}
        >
          <CalendarPlus size={16} aria-hidden="true" />
          {t('patients.schedule')}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-end text-text">{children}</dd>
    </div>
  );
}
