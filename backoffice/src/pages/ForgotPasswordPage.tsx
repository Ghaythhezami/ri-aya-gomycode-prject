import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const schema = z.object({ email: z.string().email(t('auth.emailRequired')) });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-[16px] border border-border bg-white p-8">
        <h1 className="text-xl font-semibold">{t('auth.forgotTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('auth.forgotSubtitle')}</p>
        {sent ? (
          <p className="mt-6 rounded-[12px] bg-accent px-3 py-2 text-sm text-primary" role="status">
            {t('auth.forgotSent')}
          </p>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              await api.post('/api/auth/forgot-password', values);
              setSent(true);
            })}
          >
            <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register('email')} />
            </Field>
            <Button className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('auth.sending') : t('auth.sendLink')}
            </Button>
          </form>
        )}
        <Link className="mt-6 inline-block text-sm text-primary" to="/login">
          {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  );
}
