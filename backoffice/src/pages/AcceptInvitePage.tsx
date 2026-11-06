import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

interface InvitationScope {
  email: string;
  organizationName: string;
  clinicName: string;
  role: string;
  emailKnown: boolean;
}

/**
 * Invitation landing page (FR-008, FR-046, AC-016, AC-061).
 *
 * The link carries a convenience scope, but this page resolves it from the
 * persisted record (`GET /api/invitations/:token`) so it never trusts a tampered
 * link (FR-047). An expired or already-used token is not a dead end: the user is
 * offered a way to request a new invitation, and a valid one can be declined
 * without creating an account (AC-036, AC-056).
 */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
        if (code === 'INVALID_INVITATION') setExpired(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/accept-invite', { token, password, firstName, lastName });
      navigate('/login', { replace: true });
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      if (code === 'INVALID_INVITATION') {
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

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-text">{t('invite.title')}</h1>
      {scope ? (
        <p className="mt-1 text-sm text-muted">
          {t('invite.joining', { clinic: scope.clinicName, role: t(`roles.${scope.role}`) })}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('invite.subtitle')}</p>
      )}

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label={t('register.firstName')}>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label={t('register.lastName')}>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label={t('register.password')}>
          <Input
            type="password"
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

      <button
        type="button"
        onClick={decline}
        className="mt-4 text-sm text-muted underline hover:text-text"
      >
        {t('invite.decline')}
      </button>
    </div>
  );
}
