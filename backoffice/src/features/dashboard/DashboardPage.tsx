import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarCheck,
  ChevronRight,
  Clock3,
  LogIn,
  Minus,
  Plus,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { can } from '@riaya/shared';
import type { AppointmentListItem, DashboardDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { asClinicError } from '../../store/clinicApi';
import { openBooking } from '../booking/booking-launcher';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { StatusBadge } from '../shared/StatusBadge';
import { useDashboardQuery } from './api';
import { DashboardCharts } from './DashboardCharts';
import { relativeTime, scheduleMarkers, signed } from './logic';

type Tone = 'good' | 'bad' | 'neutral';

function Trend({ tone, up, children }: { tone: Tone; up: boolean | null; children: ReactNode }) {
  const toneClass = { good: 'text-success', bad: 'text-error', neutral: 'text-muted' }[tone];
  const Icon = up === null ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-1 flex items-center gap-1 text-xs ${toneClass}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function KpiTile({
  label,
  value,
  unit,
  icon,
  iconClass,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`grid size-12 shrink-0 place-items-center rounded-lg ${iconClass}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold text-text">
            {value}
            {unit ? <span className="ms-1 text-base font-medium">{unit}</span> : null}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

function KpiGrid({ data }: { data: DashboardDto['kpis'] }) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const todayTone: Tone =
    data.todayChangePct > 0 ? 'good' : data.todayChangePct < 0 ? 'bad' : 'neutral';
  // Waiting time: lower is better, so a fall is the good direction.
  const waitTone: Tone =
    data.avgWaitChangePct < 0 ? 'good' : data.avgWaitChangePct > 0 ? 'bad' : 'neutral';

  return (
    <section
      aria-label={t('dashboard.kpis.label')}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiTile
        label={t('dashboard.kpis.today')}
        value={format.number(data.todayAppointments)}
        icon={<CalendarCheck size={22} />}
        iconClass="bg-accent text-primary"
      >
        <Trend tone={todayTone} up={data.todayChangePct === 0 ? null : data.todayChangePct > 0}>
          {t('dashboard.kpis.vsYesterday', { pct: signed(data.todayChangePct) })}
        </Trend>
      </KpiTile>

      <KpiTile
        label={t('dashboard.kpis.waiting')}
        value={format.number(data.patientsWaiting)}
        icon={<Users size={22} />}
        iconClass="bg-warning/10 text-warning"
      >
        <Trend
          tone={data.waitingOverTarget > 0 ? 'bad' : 'good'}
          up={data.waitingOverTarget > 0 ? true : null}
        >
          {data.waitingOverTarget > 0
            ? t('dashboard.kpis.overTarget', { count: data.waitingOverTarget })
            : t('dashboard.kpis.withinTarget')}
        </Trend>
      </KpiTile>

      <KpiTile
        label={t('dashboard.kpis.doctors')}
        value={`${format.number(data.availableDoctors)} / ${format.number(data.totalDoctors)}`}
        icon={<Stethoscope size={22} />}
        iconClass="bg-info/10 text-info"
      >
        <Trend tone="neutral" up={null}>
          {t('dashboard.kpis.utilisation', { pct: Math.round(data.utilisation) })}
        </Trend>
      </KpiTile>

      <KpiTile
        label={t('dashboard.kpis.avgWait')}
        value={format.number(Math.round(data.avgWaitMinutes))}
        unit={t('dashboard.kpis.min')}
        icon={<Clock3 size={22} />}
        iconClass="bg-accent text-primary"
      >
        <Trend tone={waitTone} up={data.avgWaitChangePct === 0 ? null : data.avgWaitChangePct > 0}>
          {t('dashboard.kpis.vsLastWeek', { pct: signed(data.avgWaitChangePct) })}
        </Trend>
      </KpiTile>
    </section>
  );
}

function ScheduleCard({ items, now }: { items: AppointmentListItem[]; now: number }) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const { user } = useAuth();
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [items],
  );
  const { highlightId, nowIndex } = scheduleMarkers(sorted, now);
  const listRef = useRef<HTMLOListElement>(null);
  // Bring the "Now" marker into view inside the scrollable list (not the page).
  useEffect(() => {
    const list = listRef.current;
    const marker = list?.querySelector<HTMLElement>('[data-now]');
    if (list && marker) list.scrollTop = Math.max(0, marker.offsetTop - list.offsetTop - 120);
  }, [nowIndex, sorted.length]);

  const nowRow = (
    <li
      key="now"
      data-now=""
      aria-label={`${t('dashboard.schedule.now')} ${format.time(now)}`}
      className="flex items-center gap-3 px-4 py-1"
    >
      <span className="w-16 shrink-0 text-xs font-semibold text-primary">
        {t('dashboard.schedule.now')}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-primary" />
      <span dir="ltr" className="text-xs font-semibold text-primary">
        {format.time(now)}
      </span>
    </li>
  );

  return (
    <section
      aria-labelledby="dash-schedule"
      className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="dash-schedule" className="text-sm font-semibold text-text">
          {t('dashboard.schedule.title')}
        </h2>
        <Link
          to="/appointments?from=today&to=today"
          className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent"
        >
          {t('clinic.viewAll')}
          <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={t('dashboard.schedule.emptyTitle')}
            description={t('dashboard.schedule.emptyBody')}
            action={
              can(user?.role, 'manageAppointments') ? (
                <Button onClick={() => openBooking()}>
                  <Plus size={16} aria-hidden="true" />
                  {t('shell.newAppointment')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ol
          ref={listRef}
          tabIndex={0}
          aria-labelledby="dash-schedule"
          className="max-h-[34rem] divide-y divide-border overflow-y-auto overscroll-contain"
        >
          {sorted.flatMap((item, index) => {
            const highlighted = item.id === highlightId;
            const row = (
              <li key={item.id}>
                <Link
                  to={`/appointments/${item.id}`}
                  className={`grid min-h-16 grid-cols-[4rem_1fr_auto] items-center gap-3 px-4 py-2 transition hover:bg-bg md:grid-cols-[4rem_1fr_1fr_auto] ${
                    highlighted
                      ? 'border-s-4 border-primary bg-accent/60'
                      : 'border-s-4 border-transparent'
                  }`}
                >
                  <span dir="ltr" className="text-xs font-semibold text-primary">
                    {highlighted && item.status === 'IN_PROGRESS' ? (
                      <span className="block">{t('dashboard.schedule.now')}</span>
                    ) : null}
                    <span
                      className={
                        highlighted && item.status === 'IN_PROGRESS' ? 'font-normal text-muted' : ''
                      }
                    >
                      {format.time(item.startsAt)}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar initials={item.patient.initials} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text">
                        {item.patient.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {t(`clinic.type.${item.type}`)}
                        <span className="md:hidden"> · {item.doctor.name}</span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className="block truncate text-sm font-medium text-text">
                      {item.doctor.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {item.doctor.specialty}
                    </span>
                  </span>
                  <StatusBadge status={item.status} />
                </Link>
              </li>
            );
            return index === nowIndex ? [nowRow, row] : [row];
          })}
          {nowIndex >= sorted.length ? nowRow : null}
        </ol>
      )}
    </section>
  );
}

const ACTIVITY_ICON = {
  CHECK_IN: { Icon: LogIn, className: 'bg-accent text-primary' },
  CANCELLATION: { Icon: XCircle, className: 'bg-error/10 text-error' },
  NEW_PATIENT: { Icon: UserPlus, className: 'bg-info/10 text-info' },
  REMINDER: { Icon: Bell, className: 'bg-warning/10 text-warning' },
} as const;

function ActivityCard({ data, now }: { data: DashboardDto; now: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const format = useClinicFormat();

  return (
    <section
      aria-labelledby="dash-activity"
      className="flex flex-col rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 id="dash-activity" className="text-sm font-semibold text-text">
          {t('dashboard.activity.title')}
        </h2>
      </div>
      {data.activity.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{t('dashboard.activity.empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.activity.map((entry) => {
            const { Icon, className } = ACTIVITY_ICON[entry.kind];
            return (
              <li key={entry.kind} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className={`grid size-10 shrink-0 place-items-center rounded-lg ${className}`}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {t(`dashboard.activity.${entry.kind}.title`)}
                  </span>
                  <span className="block text-xs text-muted">
                    {t(`dashboard.activity.${entry.kind}.body`, { count: entry.count })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {relativeTime(entry.at, now, format.locale)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {data.insight && can(user?.role, 'viewScheduling') ? (
        <div className="m-4 mt-auto flex items-center gap-3 rounded-lg border border-primary/30 bg-accent p-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-primary"
          >
            <Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text">{t('dashboard.insight.title')}</p>
            <p className="text-xs text-muted">
              {t('dashboard.insight.optimize', { minutes: Math.round(data.insight.minutesSaved) })}
            </p>
          </div>
          <Link
            to="/scheduling"
            className="inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-primary hover:bg-surface"
          >
            {t('dashboard.insight.review')}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-60" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const format = useClinicFormat();
  const { data, isLoading, isError, error, refetch } = useDashboardQuery(undefined, {
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = Number(format.time(now).slice(0, 2));
  const greetingKey =
    hour < 12 ? 'shell.greeting' : hour < 18 ? 'shell.greetingAfternoon' : 'shell.greetingEvening';
  const clinicError = asClinicError(error);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            {t(greetingKey, { name: user?.firstName ?? '' })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('shell.subtitle')} · {format.longDate(now)}
          </p>
        </div>
        {can(user?.role, 'manageAppointments') ? (
          <Button onClick={() => openBooking()}>
            <Plus size={16} aria-hidden="true" />
            {t('shell.newAppointment')}
          </Button>
        ) : null}
      </header>

      <div role="status" aria-live="polite" className="sr-only">
        {isLoading ? t('clinic.loading') : ''}
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <ErrorState
          title={t('dashboard.errorTitle')}
          description={t(`errors.${clinicError?.code ?? 'generic'}`, {
            defaultValue: clinicError?.message,
          })}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('clinic.retry')}
            </Button>
          }
        />
      ) : (
        <>
          <KpiGrid data={data.kpis} />
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ScheduleCard items={data.schedule} now={now} />
            </div>
            <ActivityCard data={data} now={now} />
          </div>
          <DashboardCharts data={data} />
        </>
      )}
    </div>
  );
}
