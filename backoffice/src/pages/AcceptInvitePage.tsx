import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { AuthLayout } from './AuthLayout';

/**
 * Invitation landing page (FR-008, AC-016).
 *
 * An expired or already-used token is not a dead end: the user is offered a way
 * to request a new invitation instead (AC-036).
 */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** The email already has an account: it joins with its current password (never reset here). */
  const [existingAccount, setExistingAccount] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        '/api/auth/accept-invite',
        existingAccount
          ? { token, password, currentPassword: password }
          : { token, password, firstName, lastName },
      );
      // Signed-out users pass through sign-in; the shell then opens onboarding.
      navigate('/onboarding', { replace: true });
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      if (code === 'INVALID_INVITATION') {
        setExpired(true);
      } else if (code === 'ACCOUNT_EXISTS_LOGIN_REQUIRED') {
        setExistingAccount(true);
        setPassword('');
        setError(t('invite.existingAccountHint'));
      } else if (code === 'INVALID_CREDENTIALS' || code === 'UNAUTHENTICATED') {
        setError(t('invite.wrongPassword'));
      } else if (code === 'MEMBERSHIP_SUSPENDED') {
        setError(t('invite.suspended'));
      } else if (code === 'WEAK_PASSWORD') {
        setError(t('invite.weakPassword'));
      } else {
        setError(t('invite.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title={t('invite.missingTitle')} subtitle={t('invite.missingBody')}>
        <Link
          className="inline-flex min-h-10 items-center font-medium text-primary underline"
          to="/login"
        >
          {t('auth.signIn')}
        </Link>
      </AuthLayout>
    );
  }

  if (expired) {
    return (
      <AuthLayout title={t('invite.expiredTitle')} subtitle={t('invite.expiredBody')}>
        <Link
          className="inline-flex min-h-10 items-center font-medium text-primary underline"
          to="/login"
        >
          {t('invite.requestNew')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('invite.title')} subtitle={t('invite.subtitle')}>
      <form className="space-y-4" onSubmit={submit}>
        {existingAccount ? null : (
          <>
            <Field label={t('register.firstName')}>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label={t('register.lastName')}>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </>
        )}
        <Field label={existingAccount ? t('invite.currentPassword') : t('register.password')}>
          <Input
            type="password"
            autoComplete={existingAccount ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting || password.length < 8}>
          {t('invite.accept')}
        </Button>
      </form>
    </AuthLayout>
  );
}
