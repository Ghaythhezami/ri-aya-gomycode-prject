import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@riaya/shared';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { rtkErrorMessage } from '../store/api';
import { Field } from '../common/Input';
import { AuthAlert, AuthInput, AuthSubmit, PasswordInput } from '../common/AuthInput';
import { AuthLayout } from '../layouts/AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  // The shared schema already carries the required-field messages.
  const schema = loginSchema;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (user) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      eyebrow={t('app.name')}
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link className="font-semibold text-primary hover:underline" to="/register">
            {t('auth.signupSubmit')}
          </Link>
        </>
      }
    >
      {(sessionMessage || serverError) && (
        <div className="mb-5">
          <AuthAlert>{serverError ?? t(sessionMessage ?? '')}</AuthAlert>
        </div>
      )}
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          setServerError(null);
          try {
            await login(values.email, values.password);
            navigate('/');
          } catch (error) {
            // Login goes through RTK Query, whose error shape is `{ data }` —
            // NOT axios's `{ response: { data } }`. Using the axios extractor
            // here always fell back to the generic message, hiding the real
            // cause (e.g. SECURITY_STATE_UNAVAILABLE).
            const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
            setServerError(
              code === 'SECURITY_STATE_UNAVAILABLE'
                ? t('auth.securityUnavailable')
                : rtkErrorMessage(error, t('auth.genericError')),
            );
          }
        })}
      >
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
          <AuthInput
            icon={<Mail size={18} aria-hidden="true" />}
            type="email"
            autoComplete="username"
            placeholder={t('auth.emailPlaceholder')}
            {...form.register('email')}
          />
        </Field>
        <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="-mt-1 text-end">
          <Link className="text-sm font-medium text-primary hover:underline" to="/forgot-password">
            {t('auth.forgot')}
          </Link>
        </div>
        <AuthSubmit disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('auth.submitting') : t('auth.submit')}
          <ArrowRight
            size={18}
            aria-hidden="true"
            className="rtl-flip transition group-hover:translate-x-0.5"
          />
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}
