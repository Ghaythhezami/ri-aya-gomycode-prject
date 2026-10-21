import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

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
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-[16px] border border-border bg-white p-8">
        <h1 className="text-xl font-semibold">{t('auth.resetTitle')}</h1>
        {done ? (
          <p className="mt-4 text-sm text-success">{t('auth.resetSuccess')}</p>
        ) : (
          <form
            className="mt-6 space-y-4"
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
            {error ? (
              <p className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-error" role="alert">
                {error}
              </p>
            ) : null}
            <Field label={t('auth.newPassword')} error={form.formState.errors.password?.message}>
              <Input type="password" {...form.register('password')} />
            </Field>
            <Field label={t('auth.confirmPassword')} error={form.formState.errors.confirm?.message}>
              <Input type="password" {...form.register('confirm')} />
            </Field>
            <Button className="w-full">{t('auth.resetSubmit')}</Button>
          </form>
        )}
        <Link className="mt-6 inline-block text-sm text-primary" to="/login">
          {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  );
}
