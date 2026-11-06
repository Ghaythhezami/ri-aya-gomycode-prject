import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

/**
 * Route-to-label map (AC-005).
 *
 * A single map keeps every page from wiring its own crumbs. The first path segment
 * names the section; a deeper segment (`/appointments/:id`) adds a "Details" crumb
 * and turns the section into a link. An unknown path falls back to Overview (EC-003).
 */
const SECTIONS: Record<string, string> = {
  '/appointments': 'nav.appointments',
  '/calendar': 'nav.calendar',
  '/patients': 'nav.patients',
  '/doctors': 'nav.doctors',
  '/staff': 'nav.doctors',
  '/scheduling': 'nav.scheduling',
  '/waiting-list': 'nav.waiting',
  '/analytics': 'nav.analytics',
  '/notifications': 'nav.notifications',
  '/settings': 'nav.settings',
  '/design-system': 'nav.designSystem',
};

/** Sections whose sub-paths are tabs of one page, not records. */
const TABBED = new Set(['/settings']);

export function Breadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const sectionPath = segments.length ? `/${segments[0]}` : '';
  const sectionKey = SECTIONS[sectionPath];
  const isDetail = Boolean(sectionKey) && segments.length > 1 && !TABBED.has(sectionPath);

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
              <ChevronRight size={14} className="rtl:-scale-x-100" />
            </li>
            <li>
              {isDetail ? (
                <Link
                  to={sectionPath}
                  className="rounded-sm hover:text-text focus-visible:outline-2"
                >
                  {t(sectionKey)}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-text">
                  {t(sectionKey)}
                </span>
              )}
            </li>
          </>
        ) : null}
        {isDetail ? (
          <>
            <li aria-hidden="true" className="text-border-strong">
              <ChevronRight size={14} className="rtl:-scale-x-100" />
            </li>
            <li>
              <span aria-current="page" className="font-medium text-text">
                {t('shellnav.crumbDetail')}
              </span>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
