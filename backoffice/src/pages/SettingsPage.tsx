import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

const SECTIONS = [
  { id: 'clinic-information', labelKey: 'settings.clinicInformation' },
  { id: 'departments', labelKey: 'settings.departments' },
  { id: 'working-hours', labelKey: 'settings.workingHours' },
  { id: 'appointments', labelKey: 'settings.appointments' },
  { id: 'reminders', labelKey: 'settings.reminders' },
  { id: 'roles-permissions', labelKey: 'settings.rolesPermissions' },
  { id: 'audit-log', labelKey: 'settings.auditLog' },
  { id: 'appearance', labelKey: 'settings.appearance' },
] as const;

/**
 * Settings shell (BP-035).
 *
 * The numbered side navigation and content card reproduce the mockup. Sections
 * are real routes, so a reload or a shared link opens the same panel and the
 * browser's back button works.
 */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <section>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {t('settings.kicker')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">
          {t('settings.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-muted">{t('settings.subtitle')}</p>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav
          aria-label={t('settings.sectionsLabel')}
          className="rounded-lg border border-border bg-surface p-2 shadow-(--shadow-card) lg:sticky lg:top-24"
        >
          <ol className="space-y-1">
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <NavLink
                  to={section.id}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm transition ${
                      isActive ? 'bg-accent font-medium text-primary' : 'text-text hover:bg-bg'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                          isActive ? 'bg-primary text-white' : 'bg-bg text-muted'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">{t(section.labelKey)}</span>
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className={isActive ? 'text-primary' : 'text-muted'}
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </section>
  );
}
