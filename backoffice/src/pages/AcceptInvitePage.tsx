import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, User } from 'lucide-react';
import { api } from '../lib/api';
import { AuthAlert, AuthInput, AuthSubmit, PasswordInput } from '../common/AuthInput';
import { Field } from '../common/Input';
import { AuthLayout } from '../layouts/AuthLayout';

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

  if (!token) {
    return (
      <AuthLayout eyebrow={t('invite.title')} title={t('invite.missingTitle')}>
        <AuthAlert>{t('invite.missingBody')}</AuthAlert>
        <InviteBackLink label={t('auth.signIn')} />
      </AuthLayout>
    );
  }

  if (expired) {
    return (
      <AuthLayout eyebrow={t('invite.title')} title={t('invite.expiredTitle')}>
        <AuthAlert>{t('invite.expiredBody')}</AuthAlert>
        <InviteBackLink label={t('invite.requestNew')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow={t('auth.signupEyebrow')}
      title={t('invite.title')}
      subtitle={t('invite.subtitle')}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('register.firstName')}>
            <AuthInput
              icon={<User size={18} />}
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label={t('register.lastName')}>
            <AuthInput
              icon={<User size={18} />}
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('register.password')}>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        {error && <AuthAlert>{error}</AuthAlert>}

        <AuthSubmit disabled={submitting || password.length < 8}>
          {t('invite.accept')}
          <ArrowRight
            size={18}
            className="transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
          />
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}

function InviteBackLink({ label }: { label: string }) {
  return (
    <Link
      className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      to="/login"
    >
      <ArrowLeft size={16} className="rtl:rotate-180" />
      {label}
    </Link>
  );
}
