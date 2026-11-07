import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { CalendarDays, HeartPulse, Home, LogOut, Sparkles, User } from 'lucide-react';
import i18n from '../i18n';
import { Dropdown } from '../common/Dropdown';
import { LanguageSwitcher } from '../layouts/LanguageSwitcher';
import { portalApi } from './api';
import { Initials, Notice, Spinner } from './components/ui';
import { usePortalAuth } from './PortalAuthContext';

const NAV = [
  { to: '/portal', key: 'home', Icon: Home, end: true },
  { to: '/portal/appointments', key: 'appointments', Icon: CalendarDays, end: false },
  { to: '/portal/assistant', key: 'assistant', Icon: Sparkles, end: false },
  { to: '/portal/health', key: 'health', Icon: HeartPulse, end: false },
  { to: '/portal/profile', key: 'profile', Icon: User, end: false },
] as const;

function linkClass({ isActive }: { isActive: boolean }, layout: 'side' | 'tab') {
  const base =
    layout === 'side'
      ? 'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium'
      : 'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium';
  const tone = isActive
    ? layout === 'side'
      ? 'bg-accent text-primary'
      : 'text-primary'
    : 'text-muted hover:text-text';
  return `${base} ${tone}`;
}

/**
 * Patient shell, separate from the staff AppShell: top bar (clinic, language, account),
 * bottom tab bar below 1024px and a side nav from 1024px. Mobile first (375px).
 */
export function PortalShell() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { me, logout, updateMe } = usePortalAuth();

  // Doctor, type and clinic names come back in the UI language, so a switch refetches
  // everything and (once) saves the preference on the account.
  useEffect(() => {
    const onChange = (lng: string) => {
      dispatch(portalApi.util.resetApiState());
      const locale = lng.slice(0, 2);
      if (me && me.preferredLocale !== locale && ['en', 'fr', 'ar'].includes(locale)) {
        void updateMe({ preferredLocale: locale as 'en' | 'fr' | 'ar' }).catch(() => undefined);
      }
    };
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, [dispatch, me, updateMe]);

  const signOut = async () => {
    await logout().catch(() => undefined);
    navigate('/portal/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-bg text-text">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('portal.shell.skip')}
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              {t('portal.shell.brand')}
            </p>
            <p className="truncate text-sm font-semibold text-text">{me?.clinicName}</p>
          </div>
          <LanguageSwitcher />
          <Dropdown
            label={t('portal.shell.account')}
            trigger={<Initials value={(me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '')} />}
            items={[
              {
                id: 'profile',
                label: t('portal.nav.profile'),
                icon: <User size={16} aria-hidden />,
                onSelect: () => navigate('/portal/profile'),
              },
              {
                id: 'logout',
                label: t('portal.shell.logout'),
                icon: <LogOut size={16} aria-hidden />,
                tone: 'danger',
                onSelect: () => void signOut(),
              },
            ]}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-3 sm:px-6 lg:py-6">
        <nav
          aria-label={t('portal.shell.nav')}
          className="sticky top-24 hidden h-fit w-56 shrink-0 lg:block"
        >
          <ul className="space-y-1">
            {NAV.map(({ to, key, Icon, end }) => (
              <li key={key}>
                <NavLink to={to} end={end} className={(s) => linkClass(s, 'side')}>
                  <Icon size={18} aria-hidden />
                  {t(`portal.nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="portal-main" tabIndex={-1} className="min-w-0 flex-1 py-5 pb-24 lg:pb-6">
          {me && !me.verified ? (
            <div className="mx-auto mb-4 max-w-3xl">
              <Notice tone="warning">
                <p className="font-medium">{t('portal.unverified.title')}</p>
                <p className="mt-0.5">{t('portal.unverified.body')}</p>
              </Notice>
            </div>
          ) : null}
          <Suspense fallback={<Spinner label={t('portal.common.loading')} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav
        aria-label={t('portal.shell.nav')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map(({ to, key, Icon, end }) => (
            <li key={key}>
              <NavLink to={to} end={end} className={(s) => linkClass(s, 'tab')}>
                {({ isActive }) => (
                  <>
                    <Icon size={20} aria-hidden />
                    <span className={isActive ? 'underline underline-offset-4' : ''}>
                      {t(`portal.nav.${key}`)}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
