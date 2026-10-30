import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { rtkErrorMessage } from '../store/api';
import { AuthAlert, AuthInput, AuthSubmit, PasswordInput } from '../common/AuthInput';
import { Field } from '../common/Input';
import { AuthLayout } from '../layouts/AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = z.object({
    email: z.string().email(t('auth.emailRequired')),
    password: z.string().min(1, t('auth.passwordRequired')),
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (user) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      eyebrow={t('auth.welcome')}
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
    >
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
        {(sessionMessage || serverError) && (
          <AuthAlert>{serverError ?? t(sessionMessage ?? '')}</AuthAlert>
        )}
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
          <AuthInput
            icon={<Mail size={18} />}
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
            className="transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
          />
        </AuthSubmit>
      </form>
      <p className="mt-8 text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link className="font-semibold text-primary hover:underline" to="/register">
          {t('auth.signupSubmit')}
        </Link>
      </p>
    </AuthLayout>
  );
}
