import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Route-to-label map (AC-005).
 *
 * A single map keeps every page from wiring its own crumbs; an unknown path
 * falls back to Overview (EC-003).
 */
const SECTIONS: Record<string, string> = {
  '/appointments': 'nav.appointments',
  '/calendar': 'nav.calendar',
  '/patients': 'nav.patients',
  '/staff': 'nav.staff',
  '/waiting-list': 'nav.waiting',
  '/analytics': 'nav.analytics',
  '/notifications': 'nav.notifications',
  '/settings': 'nav.settings',
  '/design-system': 'nav.designSystem',
};

export function Breadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const firstSegment = `/${pathname.split('/')[1] ?? ''}`;
  const sectionKey = SECTIONS[pathname] ?? SECTIONS[firstSegment];

  return (
    <nav aria-label={t('breadcrumbs.label')} className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <li>
          {sectionKey ? (
            <Link to="/" className="rounded-sm hover:text-text focus-visible:outline-2">
              {t('nav.overview')}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-text">
              {t('nav.overview')}
            </span>
          )}
        </li>
        {sectionKey ? (
          <>
            <li aria-hidden="true" className="text-border-strong">
              /
            </li>
            <li>
              <span aria-current="page" className="font-medium text-text">
                {t(sectionKey)}
              </span>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
