import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { ClinicPicker } from '../components/ClinicPicker';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { Notice } from '../components/ui';
import { authErrorKind, type AuthErrorKind } from '../lib/authErrors';
import { forgotSchema, type ForgotForm } from '../lib/schemas';
import { portalHttp } from '../lib/session';
import { readRememberedClinic } from '../lib/storage';

/** `/portal/forgot-password`: asks for a reset link. The answer never reveals whether the account exists. */
export function PortalForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthErrorKind | null>(null);
  const remembered = readRememberedClinic();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { clinicId: remembered?.id ?? '', email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await portalHttp.post('/auth/forgot-password', {
        clinicId: values.clinicId,
        email: values.email.trim(),
      });
      setSent(true);
    } catch (error) {
      setFailure(authErrorKind(error));
    }
  });

  const backToLogin = (
    <Link className="font-medium text-primary underline" to="/portal/login">
      {t('portal.forgot.backToLogin')}
    </Link>
  );

  if (sent) {
    return (
      <PortalAuthLayout title={t('portal.forgot.title')} footer={backToLogin}>
        <Notice tone="success">
          <p className="font-medium">{t('portal.forgot.sentTitle')}</p>
          <p className="mt-0.5">{t('portal.forgot.sentBody')}</p>
        </Notice>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout
      title={t('portal.forgot.title')}
      subtitle={t('portal.forgot.subtitle')}
      footer={backToLogin}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {failure ? (
          <Notice tone="error">
            <p className="font-medium">{t(`portal.authErrors.${failure}.title`)}</p>
            <p className="mt-0.5">{t(`portal.authErrors.${failure}.body`)}</p>
          </Notice>
        ) : null}
        <Controller
          control={control}
          name="clinicId"
          render={({ field }) => (
            <ClinicPicker
              value={field.value}
              error={errors.clinicId?.message}
              onChange={(c) => field.onChange(c.id)}
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
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('portal.forgot.submitting') : t('portal.forgot.submit')}
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
