import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@riaya/shared';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { ArrowLeft, Mail } from 'lucide-react';
import { Field } from '../common/Input';
import { AuthAlert, AuthInput, AuthSubmit } from '../common/AuthInput';
import { AuthLayout } from '../layouts/AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const schema = forgotPasswordSchema;
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  return (
    <AuthLayout
      eyebrow={t('auth.forgotEyebrow')}
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={
        <Link
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          to="/login"
        >
          <ArrowLeft size={16} aria-hidden="true" className="rtl-flip" />
          {t('auth.backToLogin')}
        </Link>
      }
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
              icon={<Mail size={18} aria-hidden="true" />}
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
    </AuthLayout>
  );
}
