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
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {formatDate(new Date(), locale, active?.clinicTimezone)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {t(greeting, { name: user?.firstName ?? '' })}
        </h1>
        <p className="mt-2 text-muted">
          {data
            ? t('overview.subtitle', { organization: data.organization.name })
            : t('shell.subtitle')}
        </p>
      </header>

      {firstRun && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-(--shadow-card)">
          <h2 className="text-lg font-semibold">{t('firstRun.title')}</h2>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? [0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-lg border border-border bg-surface"
              />
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

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-text">{t('overview.clinicBreakdown')}</h2>
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
              <div key={index} className="h-10 animate-pulse rounded bg-bg" />
            ))}
          </div>
        ) : !data || data.clinics.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('overview.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="px-4 py-2">{t('overview.clinic')}</th>
                  <th className="px-4 py-2">{t('overview.membersShort')}</th>
                  <th className="px-4 py-2">{t('overview.patientsShort')}</th>
                  <th className="px-4 py-2">{t('overview.doctorsShort')}</th>
                  <th className="px-4 py-2">{t('overview.todayShort')}</th>
                  <th className="px-4 py-2">{t('overview.upcomingShort')}</th>
                </tr>
              </thead>
              <tbody>
                {data.clinics.map((clinic) => {
                  const isActive = clinic.id === active?.clinicId;
                  return (
                    <tr
                      key={clinic.id}
                      className={`border-t border-border ${isActive ? 'bg-accent/50' : ''}`}
                    >
                      <td className="px-4 py-2 text-text">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{clinic.name}</span>
                          {isActive ? (
                            <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
                              {t('overview.active')}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted">{clinic.members}</td>
                      <td className="px-4 py-2 text-muted">{clinic.patients}</td>
                      <td className="px-4 py-2 text-muted">{clinic.doctors}</td>
                      <td className="px-4 py-2 text-muted">{clinic.todayAppointments}</td>
                      <td className="px-4 py-2 text-muted">{clinic.upcomingAppointments}</td>
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
