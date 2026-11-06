import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarDays, ChevronLeft, Clock, DoorOpen, Pencil, Power } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { color } from '../../design-system/tokens';
import { ChartPanel } from '../analytics/ChartPanel';
import { SecondaryNames } from '../patients/SecondaryNames';
import { Avatar } from '../shared/Avatar';
import { PeriodPicker } from '../shared/PeriodPicker';
import { weekStartFor } from '../shared/period';
import { usePeriod } from '../shared/usePeriod';
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
import { canUser } from '../../auth/permissions';

export function DoctorDetailPage() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const specialtyLabel = useSpecialtyLabel();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useClinicFormat();
  const { period, today, setPeriod } = usePeriod();
  const {
    data: doctor,
    isLoading,
    isError,
    error,
    refetch,
  } = useDoctorQuery({ id, from: period.from, to: period.to });
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

  const axisProps = {
    tickLine: false,
    axisLine: false,
    fontSize: 12,
    stroke: color.muted,
  } as const;
  const daily = (doctor.daily ?? []).map((d) => ({
    ...d,
    label: fmt.shortDate(`${d.date}T12:00:00Z`),
  }));
  const admin = canUser(user, 'manageDoctors');
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
          <SecondaryNames
            first={doctor.firstNameI18n}
            last={doctor.lastNameI18n}
            shown={doctor.name}
          />
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

      <section
        aria-label={t('doctors.period.title')}
        className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-text">{t('doctors.period.title')}</h2>
          <PeriodPicker
            value={period}
            onChange={setPeriod}
            today={today}
            weekStart={weekStartFor(fmt.locale)}
            locale={fmt.locale}
          />
        </div>
        {doctor.period && (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {(
              [
                ['appointmentsCount', fmt.number(doctor.period.appointmentsCount)],
                ['completed', fmt.number(doctor.period.completedCount)],
                ['noShows', fmt.number(doctor.period.noShowCount)],
                ['utilisation', `${fmt.number(Math.round(doctor.period.utilisation))}%`],
                [
                  'busiestDay',
                  doctor.period.busiestDay
                    ? fmt.shortDate(`${doctor.period.busiestDay}T12:00:00Z`)
                    : '–',
                ],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-md bg-bg p-3">
                <dt className="text-xs text-muted">{t(`doctors.columns.${key}`)}</dt>
                <dd className="mt-1 text-lg font-semibold text-text">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {daily.length > 0 && (
          <ChartPanel
            title={t('doctors.period.chart')}
            summary={t('doctors.period.summary', {
              count: daily.length,
              total: doctor.period?.appointmentsCount ?? 0,
            })}
            columns={[t('analytics.date'), t('doctors.period.chartColumns')]}
            rows={daily.map((d): [string, string] => [
              d.label,
              `${fmt.number(d.appointments)} · ${fmt.number(Math.round(d.utilisation))}%`,
            ])}
          >
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={daily}>
                <CartesianGrid stroke={color.border} vertical={false} />
                <XAxis dataKey="label" reversed={rtl} minTickGap={16} {...axisProps} />
                <YAxis
                  yAxisId="count"
                  orientation={rtl ? 'right' : 'left'}
                  allowDecimals={false}
                  width={32}
                  {...axisProps}
                />
                <YAxis
                  yAxisId="pct"
                  orientation={rtl ? 'left' : 'right'}
                  domain={[0, 100]}
                  width={36}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${color.border}`,
                    fontSize: 12,
                  }}
                  formatter={(v, name) =>
                    name === 'utilisation'
                      ? [`${fmt.number(Number(v))}%`, t('doctors.utilisation')]
                      : [fmt.number(Number(v)), t('doctors.columns.appointments')]
                  }
                />
                <Bar
                  yAxisId="count"
                  dataKey="appointments"
                  fill={color.primary}
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="utilisation"
                  stroke={color.info}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
      </section>

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
