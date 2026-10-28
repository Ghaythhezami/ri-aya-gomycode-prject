import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

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
 * Three-step registration wizard: Account -> Organization -> Clinic.
 *
 * Nothing is persisted until the final submit, so pressing Back never leaves a
 * half-created organization behind (AC-002). The public route can only create a
 * NEW organization; it can never join an existing clinic (AC-018).
 */
export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<WizardState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof WizardState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setError(null);
  };

  const stepOneValid = form.email.includes('@') && form.password.length >= 8;
  const stepTwoValid = form.firstName.trim() !== '' && form.lastName.trim() !== '';
  const stepThreeValid = form.organizationName.trim() !== '' && form.clinicName.trim() !== '';

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/register', form);
      navigate('/login', { replace: true });
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(code === 'EMAIL_TAKEN' ? t('register.emailTaken') : t('register.genericError'));
      // A duplicate email is a step-1 problem: send the user back to fix it.
      if (code === 'EMAIL_TAKEN') setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-[#172B4D]">{t('register.title')}</h1>
      <p className="mt-1 text-sm text-[#697586]">{t('register.subtitle')}</p>

      <ol className="mt-6 flex items-center gap-2 text-xs" aria-label={t('register.progress')}>
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            aria-current={step === n ? 'step' : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center ${
              step === n
                ? 'bg-[#0F766E] text-white'
                : step > n
                  ? 'bg-[#DDF6F3] text-[#0F766E]'
                  : 'bg-[#F7F9FC] text-[#697586]'
            }`}
          >
            {t(`register.step${n}`)}
          </li>
        ))}
      </ol>

      <form
        className="mt-6 space-y-4"
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
          <>
            <Field label={t('register.email')}>
              <Input type="email" value={form.email} onChange={set('email')} required />
            </Field>
            <Field label={t('register.password')}>
              <Input type="password" value={form.password} onChange={set('password')} required />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t('register.firstName')}>
              <Input value={form.firstName} onChange={set('firstName')} required />
            </Field>
            <Field label={t('register.lastName')}>
              <Input value={form.lastName} onChange={set('lastName')} required />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label={t('register.organizationName')}>
              <Input value={form.organizationName} onChange={set('organizationName')} required />
            </Field>
            <Field label={t('register.clinicName')}>
              <Input value={form.clinicName} onChange={set('clinicName')} required />
            </Field>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-[#DC2626]">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {step > 1 && (
            <Button type="button" variant="secondary" onClick={() => setStep((step - 1) as Step)}>
              {t('register.back')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={
              submitting ||
              (step === 1 && !stepOneValid) ||
              (step === 2 && !stepTwoValid) ||
              (step === 3 && !stepThreeValid)
            }
          >
            {step === 3 ? t('register.create') : t('register.next')}
          </Button>
        </div>
      </form>

      <p className="mt-6 text-sm text-[#697586]">
        {t('register.haveAccount')}{' '}
        <Link className="text-[#0F766E] underline" to="/login">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
