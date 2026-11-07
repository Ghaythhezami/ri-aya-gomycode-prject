import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ToastProvider } from '../common/Toast';
import { PortalAuthProvider, usePortalAuth } from './PortalAuthContext';
import { PortalAuthLayout } from './components/PortalAuthLayout';
import { ButtonLink, Notice, Spinner } from './components/ui';
import { onboardingRedirect } from './lib/onboarding';

/** Only same-portal paths are honoured as a post-login destination (no open redirect). */
export function safePortalNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/portal') || next.startsWith('//')) return '/portal';
  if (/^\/portal\/(login|register|invite)/.test(next)) return '/portal';
  return next;
}

/** Mounts the patient session and toasts for everything under `/portal`. */
export function PortalRoot() {
  return (
    <PortalAuthProvider>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </PortalAuthProvider>
  );
}

/** Guarded area: waits for the silent refresh, sends strangers to sign-in, new patients to onboarding. */
export function PortalGuard() {
  const { t } = useTranslation();
  const { status, me, disabled } = usePortalAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label={t('portal.common.loading')} />;
  if (status === 'anonymous' && disabled) return <PortalDisabledPage />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/portal/login?next=${next}`} replace />;
  }
  const redirect = onboardingRedirect(me, location.pathname);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

/** Sign-in, sign-up and invite pages: a signed-in patient goes straight to the portal. */
export function PortalPublicOnly() {
  const { t } = useTranslation();
  const { status } = usePortalAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner label={t('portal.common.loading')} />;
  if (status === 'authenticated') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={safePortalNext(next)} replace />;
  }
  return <Outlet />;
}

/** Shown after the clinic turned the patient portal off: the patient was signed out. */
export function PortalDisabledPage() {
  const { t } = useTranslation();
  return (
    <PortalAuthLayout title={t('portal.disabled.title')}>
      <Notice tone="info">
        <p>{t('portal.disabled.body')}</p>
      </Notice>
      <div className="mt-4">
        <ButtonLink to="/portal/login" variant="secondary">
          {t('portal.login.submit')}
        </ButtonLink>
      </div>
    </PortalAuthLayout>
  );
}
