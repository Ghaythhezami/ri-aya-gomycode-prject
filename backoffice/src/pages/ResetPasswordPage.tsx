import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../lib/api';
import { AuthAlert, AuthSubmit, PasswordInput } from '../common/AuthInput';
import { Field } from '../common/Input';
import { AuthLayout } from '../layouts/AuthLayout';
import { BackToLogin } from './ForgotPasswordPage';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z
    .object({
      password: z.string().min(10, t('auth.weakPassword')),
      confirm: z.string(),
    })
    .refine((value) => value.password === value.confirm, {
      message: t('auth.passwordMismatch'),
      path: ['confirm'],
    });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  return (
    <AuthLayout eyebrow={t('auth.forgotEyebrow')} title={t('auth.resetTitle')}>
      {done ? (
        <AuthAlert tone="success">{t('auth.resetSuccess')}</AuthAlert>
      ) : (
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await api.post('/api/auth/reset-password', { token, password: values.password });
              setDone(true);
            } catch (err) {
              setError(getErrorMessage(err, t('auth.invalidToken')));
            }
          })}
        >
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <Field label={t('auth.newPassword')} error={form.formState.errors.password?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label={t('auth.confirmPassword')} error={form.formState.errors.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <AuthSubmit disabled={form.formState.isSubmitting}>{t('auth.resetSubmit')}</AuthSubmit>
        </form>
      )}
      <BackToLogin label={t('auth.backToLogin')} />
    </AuthLayout>
  );
}
