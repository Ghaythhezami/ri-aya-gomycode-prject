import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth, getErrorMessage } from '../auth/AuthContext';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { LanguageSwitcher } from '../layouts/LanguageSwitcher';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
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
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-[16px] border border-border bg-white p-8 shadow-(--shadow-card)">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary">{t('app.name')}</p>
              <h1 className="text-xl font-semibold">{t('auth.welcome')}</h1>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <p className="mb-6 text-sm text-muted">{t('auth.subtitle')}</p>
        {(sessionMessage || serverError) && (
          <p className="mb-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-error" role="alert">
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
              setServerError(getErrorMessage(error, t('auth.genericError')));
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
            <Link className="text-sm text-primary" to="/forgot-password">
              {t('auth.forgot')}
            </Link>
          </div>
          <Button className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('auth.submitting') : t('auth.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
