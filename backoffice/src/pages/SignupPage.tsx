import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../common/Button';
import { Field, Input } from '../common/Input';
import { LanguageSwitcher } from '../layouts/LanguageSwitcher';
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
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md rounded-[16px] border border-border bg-white p-8 shadow-(--shadow-card)">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RI'AYA"
              className="h-12 w-12 rounded-xl bg-black object-cover"
            />
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary">{t('app.name')}</p>
              <h1 className="text-xl font-semibold">{t('auth.signupTitle')}</h1>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <p className="mb-6 text-sm text-muted">{t('auth.signupSubtitle')}</p>
        {done ? (
          <p className="rounded-[12px] bg-accent px-3 py-3 text-sm text-primary" role="status">
            {t('auth.signupPending')}
          </p>
        ) : (
          <form
            className="space-y-4"
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
            {serverError ? (
              <p className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-error" role="alert">
                {serverError}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('auth.firstName')} error={form.formState.errors.firstName?.message}>
                <Input {...form.register('firstName')} />
              </Field>
              <Field label={t('auth.lastName')} error={form.formState.errors.lastName?.message}>
                <Input {...form.register('lastName')} />
              </Field>
            </div>
            <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...form.register('email')} />
            </Field>
            <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...form.register('password')} />
            </Field>
            <Field label={t('auth.confirmPassword')} error={form.formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
            </Field>
            <Button className="w-full" disabled={isLoading}>
              {isLoading ? t('auth.signupSubmitting') : t('auth.signupSubmit')}
            </Button>
          </form>
        )}
        <p className="mt-6 text-sm text-muted">
          {t('auth.haveAccount')}{' '}
          <Link className="font-medium text-primary" to="/login">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
