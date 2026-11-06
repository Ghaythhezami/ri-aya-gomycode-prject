import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@riaya/shared';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const schema = forgotPasswordSchema;
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <p className="mt-6 rounded-md bg-accent px-3 py-2 text-sm text-primary" role="status">
          {t('auth.forgotSent')}
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setFailed(false);
            try {
              await api.post('/api/auth/forgot-password', values);
              setSent(true);
            } catch {
              setFailed(true);
            }
          })}
        >
          {failed ? (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error" role="alert">
              {t('auth.genericError')}
            </p>
          ) : null}
          <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
          <Button className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('auth.sending') : t('auth.sendLink')}
          </Button>
        </form>
      )}
      <Link
        className="mt-6 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        to="/login"
      >
        {t('auth.backToLogin')}
      </Link>
    </AuthLayout>
  );
}
