import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { AuthAlert, AuthInput, AuthSubmit } from '../common/AuthInput';
import { Field } from '../common/Input';
import { AuthLayout } from '../layouts/AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const schema = z.object({ email: z.string().email(t('auth.emailRequired')) });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  return (
    <AuthLayout
      eyebrow={t('auth.forgotEyebrow')}
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
    >
      {sent ? (
        <AuthAlert tone="success">{t('auth.forgotSent')}</AuthAlert>
      ) : (
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            await api.post('/api/auth/forgot-password', values);
            setSent(true);
          })}
        >
          <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
            <AuthInput
              icon={<Mail size={18} />}
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              {...form.register('email')}
            />
          </Field>
          <AuthSubmit disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('auth.sending') : t('auth.sendLink')}
          </AuthSubmit>
        </form>
      )}
      <BackToLogin label={t('auth.backToLogin')} />
    </AuthLayout>
  );
}

export function BackToLogin({ label }: { label: string }) {
  return (
    <Link
      className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      to="/login"
    >
      <ArrowLeft size={16} className="rtl:rotate-180" />
      {label}
    </Link>
  );
}
