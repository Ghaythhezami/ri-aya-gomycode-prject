import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@riaya/shared';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { rtkErrorMessage } from '../store/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
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
      eyebrow={t('auth.welcome')}
      title={t('auth.loginTitle')}
      subtitle={t('auth.subtitle')}
    >
      {(sessionMessage || serverError) && (
        <p className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {serverError ?? t(sessionMessage ?? '')}
        </p>
      )}
      <form
        className="space-y-4"
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
          <Input type="email" autoComplete="username" {...form.register('email')} />
        </Field>
        <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className="pe-12"
              {...form.register('password')}
            />
            <button
              type="button"
              className="absolute inset-y-0 end-0 grid min-w-11 place-items-center text-muted"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <div className="text-end">
          <Link
            className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            to="/forgot-password"
          >
            {t('auth.forgot')}
          </Link>
        </div>
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('auth.submitting') : t('auth.submit')}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link className="font-medium text-primary" to="/signup">
          {t('auth.signupSubmit')}
        </Link>
      </p>
    </AuthLayout>
  );
}
