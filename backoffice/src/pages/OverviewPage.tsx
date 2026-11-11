import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, CalendarDays, Clock, HeartPulse, Mail, Stethoscope, Users } from 'lucide-react';
import { formatDate, negotiateLocale } from '@riaya/shared';
import { useAuth } from '../auth/AuthContext';
import { useWorkspace } from '../auth/WorkspaceContext';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { KpiCard } from '../common/KpiCard';
import { clearFirstRun, isFirstRun } from '../lib/firstRun';

interface ClinicOverview {
  id: string;
  name: string;
  timezone: string;
  members: number;
  patients: number;
  doctors: number;
  todayAppointments: number;
  upcomingAppointments: number;
}

interface OrganizationOverview {
  organization: { id: string; name: string };
  totals: {
    clinics: number;
    members: number;
    patients: number;
    doctors: number;
    todayAppointments: number;
    upcomingAppointments: number;
    pendingInvitations: number;
  };
  clinics: ClinicOverview[];
  generatedAt: string;
}

/**
 * Organization-wide landing page.
 *
 * Every number is aggregated by the API across the caller's whole organization,
 * not just the active clinic, so switching clinics never changes the headline.
 * The per-clinic table makes it obvious where the activity is coming from.
 */
export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { active } = useWorkspace();
  const [firstRun, setFirstRun] = useState(isFirstRun);
  const [data, setData] = useState<OrganizationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get<OrganizationOverview>('/api/organizations/overview');
      setData(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = negotiateLocale(i18n.resolvedLanguage);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'shell.greeting' : hour < 18 ? 'shell.greetingAfternoon' : 'shell.greetingEvening';
  const totals = data?.totals;

  return (
    <section className="space-y-6">
      <header className="hero-panel rise relative overflow-hidden rounded-2xl p-6 text-white shadow-(--shadow-float) sm:p-8">
        <div aria-hidden="true" className="dot-grid absolute inset-0 opacity-60" />
        <HeartPulse
          aria-hidden="true"
          size={180}
          strokeWidth={1}
          className="pointer-events-none absolute -end-6 -bottom-10 text-white/10"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-surface/15 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-white/90 uppercase backdrop-blur">
              <span className="live-dot size-1.5 rounded-full bg-mint" />
              {formatDate(new Date(), locale, active?.clinicTimezone)}
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t(greeting, { name: user?.firstName ?? '' })}
            </h1>
            <p className="mt-2 text-white/75">
              {data
                ? t('overview.subtitle', { organization: data.organization.name })
                : t('shell.subtitle')}
            </p>
          </div>
          {totals ? (
            <dl className="flex gap-3">
              <div className="rounded-xl border border-surface/20 bg-surface/10 px-4 py-3 backdrop-blur">
                <dt className="text-xs text-white/70">{t('overview.todayAppointments')}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{totals.todayAppointments}</dd>
              </div>
              <div className="rounded-xl border border-surface/20 bg-surface/10 px-4 py-3 backdrop-blur">
                <dt className="text-xs text-white/70">{t('overview.upcomingAppointments')}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">
                  {totals.upcomingAppointments}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </header>

      {firstRun && (
        <div className="rise relative overflow-hidden rounded-xl border border-primary/20 bg-surface p-6 shadow-(--shadow-soft)">
          <span aria-hidden="true" className="brand-gradient absolute inset-y-0 start-0 w-1" />
          <h2 className="text-lg font-semibold text-navy">{t('firstRun.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('firstRun.body')}</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              {t('firstRun.stepInvite')}{' '}
              <Link className="font-medium text-primary underline" to="/staff">
                {t('firstRun.inviteLink')}
              </Link>
            </li>
            <li>{t('firstRun.stepSettings')}</li>
          </ul>
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-primary underline"
            onClick={() => {
              clearFirstRun();
              setFirstRun(false);
            }}
          >
            {t('firstRun.dismiss')}
          </button>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error"
        >
          <span>{t('overview.loadError')}</span>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            {t('overview.retry')}
          </Button>
        </div>
      ) : null}

      <div className="rise rise-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? [0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-36 rounded-xl border border-border" />
            ))
          : totals && (
              <>
                <KpiCard
                  label={t('overview.clinics')}
                  value={totals.clinics}
                  icon={<Building2 size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.members')}
                  value={totals.members}
                  icon={<Users size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.patients')}
                  value={totals.patients}
                  icon={<HeartPulse size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.doctors')}
                  value={totals.doctors}
                  icon={<Stethoscope size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.todayAppointments')}
                  value={totals.todayAppointments}
                  icon={<CalendarDays size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.upcomingAppointments')}
                  value={totals.upcomingAppointments}
                  icon={<Clock size={18} aria-hidden="true" />}
                />
                <KpiCard
                  label={t('overview.pendingInvitations')}
                  value={totals.pendingInvitations}
                  icon={<Mail size={18} aria-hidden="true" />}
                />
              </>
            )}
      </div>

      <section className="rise rise-3 overflow-hidden rounded-xl border border-border bg-surface shadow-(--shadow-soft)">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
              <Building2 size={16} aria-hidden="true" />
            </span>
            {t('overview.clinicBreakdown')}
          </h2>
          {data ? (
            <p className="text-xs text-muted">
              {t('overview.updatedAt', {
                date: formatDate(new Date(data.generatedAt), locale, active?.clinicTimezone),
              })}
            </p>
          ) : null}
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-10 rounded-md" />
            ))}
          </div>
        ) : !data || data.clinics.length === 0 ? (
          <div className="grid place-items-center gap-3 p-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
              <Building2 size={20} aria-hidden="true" />
            </span>
            <p className="text-sm text-muted">{t('overview.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted/70 text-start text-xs font-semibold tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 text-start">{t('overview.clinic')}</th>
                  <th className="px-5 py-3 text-start">{t('overview.membersShort')}</th>
                  <th className="px-5 py-3 text-start">{t('overview.patientsShort')}</th>
                  <th className="px-5 py-3 text-start">{t('overview.doctorsShort')}</th>
                  <th className="px-5 py-3 text-start">{t('overview.todayShort')}</th>
                  <th className="px-5 py-3 text-start">{t('overview.upcomingShort')}</th>
                </tr>
              </thead>
              <tbody>
                {data.clinics.map((clinic) => {
                  const isActive = clinic.id === active?.clinicId;
                  return (
                    <tr
                      key={clinic.id}
                      className={`border-t border-border transition hover:bg-surface-muted/60 ${isActive ? 'bg-accent/40' : ''}`}
                    >
                      <td className="px-5 py-3.5 text-text">
                        <div className="flex items-center gap-3">
                          <span className="brand-gradient grid size-8 shrink-0 place-items-center rounded-md text-xs font-bold text-white">
                            {clinic.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-semibold text-navy">{clinic.name}</span>
                          {isActive ? (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {t('overview.active')}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted tabular-nums">{clinic.members}</td>
                      <td className="px-5 py-3.5 text-muted tabular-nums">{clinic.patients}</td>
                      <td className="px-5 py-3.5 text-muted tabular-nums">{clinic.doctors}</td>
                      <td className="px-5 py-3.5 text-muted tabular-nums">
                        {clinic.todayAppointments}
                      </td>
                      <td className="px-5 py-3.5 text-muted tabular-nums">
                        {clinic.upcomingAppointments}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
