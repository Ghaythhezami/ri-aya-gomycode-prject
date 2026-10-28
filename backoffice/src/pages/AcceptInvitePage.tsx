import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

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
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-[#172B4D]">{t('invite.missingTitle')}</h1>
        <p className="mt-2 text-sm text-[#697586]">{t('invite.missingBody')}</p>
        <Link className="mt-6 inline-block text-[#0F766E] underline" to="/login">
          {t('auth.signIn')}
        </Link>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-[#172B4D]">{t('invite.expiredTitle')}</h1>
        <p className="mt-2 text-sm text-[#697586]">{t('invite.expiredBody')}</p>
        <Link className="mt-6 inline-block text-[#0F766E] underline" to="/login">
          {t('invite.requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-[#172B4D]">{t('invite.title')}</h1>
      <p className="mt-1 text-sm text-[#697586]">{t('invite.subtitle')}</p>

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
          <p role="alert" className="text-sm text-[#DC2626]">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting || password.length < 8}>
          {t('invite.accept')}
        </Button>
      </form>
    </div>
  );
}
