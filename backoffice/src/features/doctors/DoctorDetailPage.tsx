import { useState } from 'react';
import { CalendarDays, ChevronLeft, Clock, DoorOpen, Pencil, Power } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { can } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { StatusBadge } from '../shared/StatusBadge';
import { useActivateDoctorMutation, useDeactivateDoctorMutation, useDoctorQuery } from './api';
import { AvailabilityChip, UtilisationBar } from './AvailabilityChip';
import { DoctorFormModal } from './DoctorFormModal';
import { isOwnProfile } from './hours';
import { LeavesPanel } from './LeavesPanel';
import { ScheduleEditor } from './ScheduleEditor';
import { WeeklyVisual } from './WeeklyVisual';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

export function DoctorDetailPage() {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useClinicFormat();
  const { data: doctor, isLoading, isError, error, refetch } = useDoctorQuery({ id });
  const [deactivate, { isLoading: deactivating }] = useDeactivateDoctorMutation();
  const [activate, { isLoading: activating }] = useActivateDoctorMutation();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t('clinic.loading')}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (isError || !doctor) {
    const notFound = asClinicError(error)?.status === 404;
    return (
      <ErrorState
        title={notFound ? t('doctors.notFound') : t('doctors.error.title')}
        description={notFound ? undefined : t('doctors.error.body')}
        action={
          notFound ? (
            <Link to="/doctors" className="text-sm font-medium text-primary underline">
              {t('doctors.backToList')}
            </Link>
          ) : (
            <Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>
          )
        }
      />
    );
  }

  const admin = user ? can(user.role, 'manageDoctors') : false;
  const canEditHours = admin || isOwnProfile(user, doctor);

  const toggleActive = async () => {
    try {
      if (doctor.isActive) {
        const result = await deactivate(doctor.id).unwrap();
        toast.success(t('doctors.toast.deactivated', { count: result.flagged }));
      } else {
        await activate(doctor.id).unwrap();
        toast.success(t('doctors.toast.activated'));
      }
      setConfirm(false);
    } catch (raw) {
      const e = asClinicError(raw);
      toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/doctors" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary">
        <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        {t('doctors.backToList')}
      </Link>
      <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
        <Avatar initials={doctor.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-text">{doctor.name}</h1>
          <p className="mt-1 text-sm text-muted">{specialtyLabel(doctor.specialty)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <AvailabilityChip availability={doctor.availability} />
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} aria-hidden="true" />
              <span dir="ltr">{doctor.hoursLabel ?? t('doctors.noHours')}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} aria-hidden="true" />
              {t('doctors.appointmentsCount', { count: doctor.appointmentsCount })}
            </span>
            {doctor.room && (
              <span className="inline-flex items-center gap-1.5">
                <DoorOpen size={14} aria-hidden="true" />
                {doctor.room.name}
              </span>
            )}
          </p>
          <div className="mt-3 max-w-xs">
            <p className="mb-1 flex justify-between text-xs text-muted">
              <span>{t('doctors.utilisation')}</span>
              <span className="font-semibold text-text">
                {fmt.number(Math.round(doctor.utilisation))}%
              </span>
            </p>
            <UtilisationBar
              value={doctor.utilisation}
              label={t('doctors.utilisationOf', { name: doctor.name })}
            />
          </div>
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden="true" />
              {t('doctors.edit')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              <Power size={16} aria-hidden="true" />
              {t(doctor.isActive ? 'doctors.deactivate' : 'doctors.activate')}
            </Button>
          </div>
        )}
      </header>

      <ScheduleEditor doctor={doctor} canEdit={canEditHours} />
      <WeeklyVisual intervals={doctor.workingHours} />
      <LeavesPanel doctor={doctor} canEdit={canEditHours} />

      <section
        aria-label={t('doctors.upcoming.title')}
        className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
      >
        <h2 className="mb-3 text-base font-semibold text-text">{t('doctors.upcoming.title')}</h2>
        {doctor.upcoming.length === 0 ? (
          <EmptyState title={t('doctors.upcoming.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {doctor.upcoming.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/appointments/${a.id}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5 hover:bg-bg"
                >
                  <div>
                    <p className="text-sm font-medium text-text">
                      {fmt.dateTime(a.startsAt)} · {a.patient.name}
                    </p>
                    <p className="text-xs text-muted" dir="ltr">
                      {a.code}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DoctorFormModal open={editing} doctor={doctor} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirm}
        title={t(doctor.isActive ? 'doctors.deactivateTitle' : 'doctors.activateTitle')}
        confirmLabel={t(doctor.isActive ? 'doctors.deactivate' : 'doctors.activate')}
        cancelLabel={t('clinic.cancel')}
        tone={doctor.isActive ? 'danger' : 'default'}
        loading={deactivating || activating}
        onConfirm={() => void toggleActive()}
        onCancel={() => setConfirm(false)}
      >
        {t(doctor.isActive ? 'doctors.deactivateBody' : 'doctors.activateBody', {
          name: doctor.name,
        })}
      </ConfirmDialog>
    </div>
  );
}
