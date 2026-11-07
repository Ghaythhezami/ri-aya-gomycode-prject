import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { PortalClinic } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { ClinicPicker } from '../components/ClinicPicker';
import { PasswordField } from '../components/PasswordField';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { Notice } from '../components/ui';
import { authErrorKind, lockoutMinutes, type AuthErrorKind } from '../lib/authErrors';
import { loginSchema, type LoginForm } from '../lib/schemas';
import { readRememberedClinic } from '../lib/storage';
import { usePortalAuth } from '../PortalAuthContext';

export function PortalLoginPage() {
  const { t } = useTranslation();
  const { login } = usePortalAuth();
  const [clinic, setClinic] = useState<PortalClinic | null>(null);
  const [failure, setFailure] = useState<AuthErrorKind | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const remembered = readRememberedClinic();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { clinicId: remembered?.id ?? '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const selected = clinic
        ? { id: clinic.id, name: clinic.name, timezone: clinic.timezone }
        : remembered && remembered.id === values.clinicId
          ? remembered
          : undefined;
      await login(values, selected);
      // PortalPublicOnly sends the signed-in patient on to `next` (or the portal home).
    } catch (error) {
      setFailure(authErrorKind(error));
      setMinutes(lockoutMinutes(error));
      setValue('password', '');
    }
  });

  return (
    <PortalAuthLayout
      title={t('portal.login.title')}
      subtitle={t('portal.login.subtitle')}
      footer={
        <>
          {t('portal.login.noAccount')}{' '}
          <Link className="font-medium text-primary underline" to="/portal/register">
            {t('portal.login.createAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {failure ? (
          <Notice tone="error">
            <p className="font-medium">{t(`portal.authErrors.${failure}.title`)}</p>
            <p className="mt-0.5">
              {failure === 'locked' && minutes
                ? t('portal.authErrors.lockedRetry', { minutes })
                : t(`portal.authErrors.${failure}.body`)}
            </p>
          </Notice>
        ) : null}
        <Controller
          control={control}
          name="clinicId"
          render={({ field }) => (
            <ClinicPicker
              value={field.value}
              error={errors.clinicId?.message}
              onChange={(c) => {
                setClinic(c);
                field.onChange(c.id);
              }}
            />
          )}
        />
        <Field label={t('portal.fields.email')} error={errors.email?.message}>
          <Input
            type="email"
            dir="ltr"
            autoComplete="username"
            inputMode="email"
            {...register('email')}
          />
        </Field>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordField
              label={t('portal.fields.password')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={errors.password?.message}
              autoComplete="current-password"
              showPolicy={false}
            />
          )}
        />
        <p className="text-sm">
          <Link className="font-medium text-primary underline" to="/portal/forgot-password">
            {t('portal.login.forgot')}
          </Link>
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('portal.login.submitting') : t('portal.login.submit')}
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
