import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { asClinicError } from '../../store/clinicApi';
import { PageHeader } from '../shared/PageHeader';
import { useSettingsQuery } from './api';
import { AppearanceSection } from './AppearanceSection';
import { AppointmentsSection } from './AppointmentsSection';
import { AuditSection } from './AuditSection';
import { ClinicSection } from './ClinicSection';
import { DepartmentsSection } from './DepartmentsSection';
import { HoursSection } from './HoursSection';
import { RemindersSection } from './RemindersSection';
import { RolesSection } from './RolesSection';
import { StaffDirectoryPage } from '../../pages/StaffDirectoryPage';

export const SETTINGS_SECTIONS = [
  'clinic',
  'departments',
  'hours',
  'appointments',
  'reminders',
  'roles',
  'audit',
  'appearance',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function NavItem({ to, label, badge }: { to: string; label: string; badge: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
          isActive ? 'bg-accent font-semibold text-primary-dark' : 'text-text hover:bg-bg'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold ${
              isActive ? 'bg-primary text-white' : 'bg-bg text-muted'
            }`}
          >
            {badge}
          </span>
          <span className="flex-1">{label}</span>
          <ChevronRight size={16} aria-hidden="true" className="text-muted rtl:-scale-x-100" />
        </>
      )}
    </NavLink>
  );
}

/** SET-1: settings hub; every section is a route under /settings/<section>. */
export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettingsQuery();
  const data = settings.data;

  return (
    <div>
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav
          aria-label={t('settings.title')}
          className="rounded-lg border border-border bg-surface p-2 shadow-(--shadow-card)"
        >
          <ul className="space-y-1">
            {SETTINGS_SECTIONS.map((section, index) => (
              <li key={section}>
                <NavItem
                  to={`/settings/${section}`}
                  label={t(`settings.sections.${section}`)}
                  badge={String(index + 1)}
                />
              </li>
            ))}
            <li className="mt-1 border-t border-border pt-1">
              <NavItem to="/settings/team" label={t('settings.sections.team')} badge="+" />
            </li>
          </ul>
        </nav>

        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="clinic" replace />} />
            {/* These sections do not need the settings document. */}
            <Route path="roles" element={<RolesSection />} />
            <Route path="audit" element={<AuditSection />} />
            <Route
              path="team"
              element={
                <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
                  <div className="border-b border-border px-6 py-5">
                    <h2 className="text-base font-semibold text-text">
                      {t('settings.team.title')}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">{t('settings.team.subtitle')}</p>
                  </div>
                  <div className="px-6 py-5">
                    <StaffDirectoryPage />
                  </div>
                </section>
              }
            />
            {(
              ['clinic', 'departments', 'hours', 'appointments', 'reminders', 'appearance'] as const
            ).map((section) => (
              <Route
                key={section}
                path={section}
                element={
                  settings.isLoading ? (
                    <div
                      className="space-y-3 rounded-lg border border-border bg-surface p-6"
                      aria-busy="true"
                    >
                      <Skeleton className="h-6 w-1/3" />
                      <Skeleton className="h-11" />
                      <Skeleton className="h-11" />
                      <Skeleton className="h-11" />
                    </div>
                  ) : data ? (
                    section === 'clinic' ? (
                      <ClinicSection settings={data} />
                    ) : section === 'departments' ? (
                      <DepartmentsSection settings={data} />
                    ) : section === 'hours' ? (
                      <HoursSection settings={data} />
                    ) : section === 'appointments' ? (
                      <AppointmentsSection settings={data} />
                    ) : section === 'reminders' ? (
                      <RemindersSection settings={data} />
                    ) : (
                      <AppearanceSection settings={data} />
                    )
                  ) : (
                    <ErrorState
                      title={t('settings.loadError')}
                      description={asClinicError(settings.error)?.message}
                      action={
                        <Button variant="secondary" onClick={() => void settings.refetch()}>
                          {t('clinic.retry')}
                        </Button>
                      }
                    />
                  )
                }
              />
            ))}
            <Route path="*" element={<Navigate to="/settings/clinic" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
