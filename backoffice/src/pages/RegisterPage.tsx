import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { markFirstRun } from '../lib/firstRun';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Lock,
  Mail,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Field } from '../common/Input';
import { AuthAlert, AuthInput, AuthSubmit } from '../common/AuthInput';
import { AuthLayout } from '../layouts/AuthLayout';

type Step = 1 | 2 | 3;

interface WizardState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  clinicName: string;
}

const EMPTY: WizardState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  organizationName: '',
  clinicName: '',
};

/**
 * Mirrors the server policy in `server/src/common/validators/password-strength.ts`.
 * The wizard must not accept a password the API will always reject (WEAK_PASSWORD).
 */
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

/**
 * Three-step registration wizard: Account -> Organization -> Clinic.
 *
 * Nothing is persisted until the final submit, so pressing Back never leaves a
 * half-created organization behind (AC-002). The public route can only create a
 * NEW organization; it can never join an existing clinic (AC-018).
 */
export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, setSessionMessage } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<WizardState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof WizardState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setError(null);
  };

  const stepOneValid = form.email.includes('@') && PASSWORD_POLICY.test(form.password);
  const stepTwoValid = form.firstName.trim() !== '' && form.lastName.trim() !== '';
  const stepThreeValid = form.organizationName.trim() !== '' && form.clinicName.trim() !== '';

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/register', form);
      // Mark the session so the new workspace opens with a first-run state (T7.5).
      markFirstRun();
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      if (code === 'EMAIL_TAKEN') {
        setError(t('register.emailTaken'));
        setStep(1);
      } else if (code === 'WEAK_PASSWORD') {
        setError(t('register.weakPassword'));
        setStep(1);
      } else {
        setError(t('register.genericError'));
      }
      return;
    } finally {
      setSubmitting(false);
    }

    // AC-001: the creator is signed in, not bounced to a bare sign-in form.
    try {
      await login(form.email, form.password);
      navigate('/', { replace: true });
    } catch {
      setSessionMessage('register.createdSignIn');
      navigate('/login', { replace: true });
    }
  }

  const steps = [
    { n: 1 as Step, icon: Mail },
    { n: 2 as Step, icon: UserRound },
    { n: 3 as Step, icon: Building2 },
  ];

  return (
    <AuthLayout
      eyebrow={t('auth.signupEyebrow')}
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <>
          {t('register.haveAccount')}{' '}
          <Link className="font-semibold text-primary hover:underline" to="/login">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <ol className="mb-8 flex items-center" aria-label={t('register.progress')}>
        {steps.map(({ n, icon: Icon }, index) => {
          const current = step === n;
          const done = step > n;
          return (
            <li
              key={n}
              aria-current={current ? 'step' : undefined}
              className="flex flex-1 items-center gap-2 last:flex-none"
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold transition ${
                  current
                    ? 'brand-gradient text-white shadow-(--shadow-glow)'
                    : done
                      ? 'bg-accent text-primary'
                      : 'bg-surface-muted text-muted'
                }`}
              >
                {done ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Icon size={16} aria-hidden="true" />
                )}
              </span>
              <span
                className={`text-sm font-medium ${current ? 'text-navy' : 'text-muted'} hidden sm:inline`}
              >
                {t(`register.step${n}`)}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`mx-2 h-0.5 flex-1 rounded-full ${done ? 'bg-primary' : 'bg-border'}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 3) {
            setStep((step + 1) as Step);
            return;
          }
          void submit();
        }}
      >
        {step === 1 && (
          <div key="step-1" className="rise space-y-5">
            <Field label={t('register.email')}>
              <AuthInput
                icon={<Mail size={18} aria-hidden="true" />}
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                value={form.email}
                onChange={set('email')}
                required
              />
            </Field>
            <Field label={t('register.password')} help={t('register.passwordHint')}>
              <AuthInput
                icon={<Lock size={18} aria-hidden="true" />}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                required
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div key="step-2" className="rise grid gap-5 sm:grid-cols-2">
            <Field label={t('register.firstName')}>
              <AuthInput
                icon={<UserRound size={18} aria-hidden="true" />}
                autoComplete="given-name"
                value={form.firstName}
                onChange={set('firstName')}
                required
              />
            </Field>
            <Field label={t('register.lastName')}>
              <AuthInput
                icon={<UserRound size={18} aria-hidden="true" />}
                autoComplete="family-name"
                value={form.lastName}
                onChange={set('lastName')}
                required
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div key="step-3" className="rise space-y-5">
            <Field label={t('register.organizationName')}>
              <AuthInput
                icon={<Building2 size={18} aria-hidden="true" />}
                autoComplete="organization"
                value={form.organizationName}
                onChange={set('organizationName')}
                required
              />
            </Field>
            <Field label={t('register.clinicName')}>
              <AuthInput
                icon={<Stethoscope size={18} aria-hidden="true" />}
                value={form.clinicName}
                onChange={set('clinicName')}
                required
              />
            </Field>
          </div>
        )}

        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="flex gap-3 pt-1">
          {step > 1 && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="min-h-13 rounded-lg px-6"
              onClick={() => setStep((step - 1) as Step)}
            >
              <ArrowLeft size={18} aria-hidden="true" className="rtl-flip" />
              {t('register.back')}
            </Button>
          )}
          <AuthSubmit
            disabled={
              submitting ||
              (step === 1 && !stepOneValid) ||
              (step === 2 && !stepTwoValid) ||
              (step === 3 && !stepThreeValid)
            }
          >
            {step === 3 ? t('register.create') : t('register.next')}
            <ArrowRight size={18} aria-hidden="true" className="rtl-flip" />
          </AuthSubmit>
        </div>
      </form>
    </AuthLayout>
  );
}
