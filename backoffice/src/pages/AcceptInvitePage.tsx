import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, setAccessToken } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

interface InvitationScope {
  email: string;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  role: string;
  expiresAt: string;
  emailKnown: boolean;
}

/** Mirrors the server policy in `server/src/common/validators/password-strength.ts`. */
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

function errorCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}

/**
 * Invitation landing page (FR-008, FR-046, AC-016, AC-061).
 *
 * The link carries the organization and clinic ids, but this page resolves the
 * scope from the persisted record (`GET /api/invitations/:token`) so it never
 * trusts a tampered link (FR-047). The next step depends on whether the invited
 * email already has an account:
 *
 * - existing account: prove ownership by signing in, accept, then open the
 *   invited clinic;
 * - new account: choose profile and login details, accept, then open the
 *   invited clinic.
 *
 * A valid invitation can be declined without creating an account (AC-036).
 */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [scope, setScope] = useState<InvitationScope | null>(null);
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Resolve the scope from the record; the link claims are only a rendering hint.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get<InvitationScope>(`/api/invitations/${token}`)
      .then(({ data }) => {
        if (!cancelled) setScope(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (errorCode(err) === 'INVALID_INVITATION') setExpired(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signedInAsInvitee =
    Boolean(user && scope) && user?.email.toLowerCase() === scope?.email.toLowerCase();

  /** New account: create the identity, sign in, and land on the invited clinic. */
  async function acceptAsNewUser(event: React.FormEvent) {
    event.preventDefault();
    if (!scope) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/accept-invite', { token, password, firstName, lastName });
      try {
        await login(scope.email, password);
        navigate('/', { replace: true });
      } catch {
        navigate('/login', { replace: true });
      }
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ACCOUNT_EXISTS') {
        // Someone created the account between resolving the page and submitting.
        setScope((current) => (current ? { ...current, emailKnown: true } : current));
        setError(t('invite.signInToAccept'));
      } else if (code === 'INVALID_INVITATION') {
        setExpired(true);
      } else if (code === 'WEAK_PASSWORD') {
        setError(t('invite.weakPassword'));
      } else {
        setError(t('invite.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Existing account: authenticate as the invited email (unless already signed
   * in as it), accept, and switch the session to the invited clinic.
   */
  async function acceptAsExistingUser(event?: React.FormEvent) {
    event?.preventDefault();
    if (!scope) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!signedInAsInvitee) {
        await login(scope.email, password);
      }
      await api.post(`/api/invitations/${token}/accept`);
      const { data } = await api.post<{ accessToken: string }>('/api/auth/switch-workspace', {
        clinicId: scope.clinicId,
      });
      setAccessToken(data.accessToken);
      // Reload so the shell, workspace provider and permissions all read the
      // token scoped to the clinic that was just joined.
      window.location.assign('/');
    } catch (err) {
      const code = errorCode(err);
      if (code === 'INVALID_INVITATION') {
        setExpired(true);
      } else if (code === 'INVITATION_EMAIL_MISMATCH') {
        setError(t('invite.emailMismatch'));
      } else if (code === 'INVALID_CREDENTIALS' || code === 'ACCOUNT_LOCKED') {
        setError(t('invite.signInError'));
      } else {
        setError(t('invite.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Decline the invitation; the token is invalidated and no account is created. */
  async function decline() {
    setError(null);
    try {
      await api.post(`/api/invitations/${token}/decline`, { token });
      setDeclined(true);
    } catch {
      setError(t('invite.genericError'));
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-text">{t('invite.missingTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('invite.missingBody')}</p>
        <Link className="mt-6 inline-block text-primary underline" to="/login">
          {t('auth.signIn')}
        </Link>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-text">{t('invite.expiredTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('invite.expiredBody')}</p>
        <Link className="mt-6 inline-block text-primary underline" to="/login">
          {t('invite.requestNew')}
        </Link>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-text">{t('invite.declinedTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('invite.declinedBody')}</p>
        <Link className="mt-6 inline-block text-primary underline" to="/login">
          {t('auth.signIn')}
        </Link>
      </div>
    );
  }

  const canSubmitNew =
    firstName.trim() !== '' && lastName.trim() !== '' && PASSWORD_POLICY.test(password);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        {t('invite.kicker')}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-text">{t('invite.title')}</h1>
      {scope ? (
        <p className="mt-1 text-sm text-muted">
          {t('invite.joining', { clinic: scope.clinicName, role: t(`roles.${scope.role}`) })}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('invite.subtitle')}</p>
      )}

      {scope ? (
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">{t('invite.organization')}</dt>
          <dd className="font-medium text-text">{scope.organizationName}</dd>
          <dt className="text-muted">{t('invite.clinic')}</dt>
          <dd className="font-medium text-text">{scope.clinicName}</dd>
          <dt className="text-muted">{t('invite.role')}</dt>
          <dd className="font-medium text-text">{t(`roles.${scope.role}`)}</dd>
          <dt className="text-muted">{t('invite.invitedEmail')}</dt>
          <dd className="truncate font-medium text-text">{scope.email}</dd>
        </dl>
      ) : null}

      {!scope ? (
        <p className="mt-6 text-sm text-muted">{t('invite.loading')}</p>
      ) : signedInAsInvitee ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted">{t('invite.signedInAs', { email: scope.email })}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void acceptAsExistingUser()} disabled={submitting}>
              {submitting ? t('invite.accepting') : t('invite.acceptAndOpen')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void decline()}>
              {t('invite.decline')}
            </Button>
          </div>
        </div>
      ) : scope.emailKnown ? (
        <form className="mt-6 space-y-4" onSubmit={acceptAsExistingUser}>
          <p className="text-sm text-muted">{t('invite.signInToAccept')}</p>
          {user && user.email.toLowerCase() !== scope.email.toLowerCase() ? (
            <p className="rounded-md bg-accent px-3 py-2 text-sm text-text">
              {t('invite.switchAccount', { current: user.email })}
            </p>
          ) : null}
          <Field label={t('auth.email')}>
            <Input type="email" value={scope.email} readOnly autoComplete="username" />
          </Field>
          <Field label={t('auth.password')}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting || password.length === 0}>
              {submitting ? t('invite.accepting') : t('invite.signInAndAccept')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void decline()}>
              {t('invite.decline')}
            </Button>
          </div>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={acceptAsNewUser}>
          <p className="text-sm text-muted">{t('invite.newAccountHint')}</p>
          <Field label={t('register.firstName')}>
            <Input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field label={t('register.lastName')}>
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              required
            />
          </Field>
          <Field label={t('register.password')} help={t('register.passwordHint')}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting || !canSubmitNew}>
              {submitting ? t('invite.accepting') : t('invite.accept')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void decline()}>
              {t('invite.decline')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
