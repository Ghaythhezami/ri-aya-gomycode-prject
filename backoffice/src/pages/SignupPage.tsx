import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail, User } from 'lucide-react';
import { AuthAlert, AuthInput, AuthSubmit, PasswordInput } from '../common/AuthInput';
import { Field } from '../common/Input';
import { AuthLayout } from '../layouts/AuthLayout';
import { rtkErrorMessage, useSignupMutation } from '../store/api';

export function SignupPage() {
  const { t } = useTranslation();
  const [signup, { isLoading }] = useSignupMutation();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = z
    .object({
      firstName: z.string().min(1, t('auth.nameRequired')),
      lastName: z.string().min(1, t('auth.nameRequired')),
      email: z.string().email(t('auth.emailRequired')),
      password: z.string().min(10, t('auth.weakPassword')),
      confirm: z.string(),
    })
    .refine((value) => value.password === value.confirm, {
      message: t('auth.passwordMismatch'),
      path: ['confirm'],
    });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirm: '' },
  });

  return (
    <AuthLayout
      eyebrow={t('auth.signupEyebrow')}
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle')}
    >
      {done ? (
        <AuthAlert tone="success">{t('auth.signupPending')}</AuthAlert>
      ) : (
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            setServerError(null);
            try {
              await signup({
                firstName: values.firstName,
                lastName: values.lastName,
                email: values.email,
                password: values.password,
              }).unwrap();
              setDone(true);
            } catch (error) {
              setServerError(rtkErrorMessage(error, t('auth.signupError')));
            }
          })}
        >
          {serverError ? <AuthAlert>{serverError}</AuthAlert> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('auth.firstName')} error={form.formState.errors.firstName?.message}>
              <AuthInput
                icon={<User size={18} />}
                autoComplete="given-name"
                {...form.register('firstName')}
              />
            </Field>
            <Field label={t('auth.lastName')} error={form.formState.errors.lastName?.message}>
              <AuthInput
                icon={<User size={18} />}
                autoComplete="family-name"
                {...form.register('lastName')}
              />
            </Field>
          </div>
          <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
            <AuthInput
              icon={<Mail size={18} />}
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              {...form.register('email')}
            />
          </Field>
          <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label={t('auth.confirmPassword')} error={form.formState.errors.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <AuthSubmit disabled={isLoading}>
            {isLoading ? t('auth.signupSubmitting') : t('auth.signupSubmit')}
            <ArrowRight
              size={18}
              className="transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            />
          </AuthSubmit>
        </form>
      )}
      <p className="mt-8 text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link className="font-semibold text-primary hover:underline" to="/login">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
