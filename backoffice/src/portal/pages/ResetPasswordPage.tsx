import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { PasswordField } from '../components/PasswordField';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { ButtonLink, Notice } from '../components/ui';
import { authErrorKind, type AuthErrorKind } from '../lib/authErrors';
import { resetSchema, type ResetForm } from '../lib/schemas';
import { portalErrorCode, portalHttp } from '../lib/session';

/** Reads `#token=` from the URL, then removes the fragment with `replaceState`. */
export function readResetToken(): string {
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
  if (token) {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return token;
}

/** `/portal/reset-password#token=`: chooses a new password. Does not sign the patient in. */
export function PortalResetPasswordPage() {
  const { t } = useTranslation();
  // The token travels in the fragment (never sent to the server). Read once, then scrub it.
  const [token] = useState(readResetToken);
  const [done, setDone] = useState(false);
  const [tokenRejected, setTokenRejected] = useState(false);
  const [failure, setFailure] = useState<AuthErrorKind | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await portalHttp.post('/auth/reset-password', { token, password: values.password });
      setDone(true);
    } catch (error) {
      if (portalErrorCode(error) === 'INVALID_TOKEN') {
        setTokenRejected(true);
        return;
      }
      setFailure(authErrorKind(error));
      setValue('password', '');
      setValue('confirm', '');
    }
  });

  if (done) {
    return (
      <PortalAuthLayout title={t('portal.reset.title')}>
        <Notice tone="success">
          <p className="font-medium">{t('portal.reset.doneTitle')}</p>
          <p className="mt-0.5">{t('portal.reset.doneBody')}</p>
        </Notice>
        <div className="mt-4">
          <ButtonLink to="/portal/login">{t('portal.login.submit')}</ButtonLink>
        </div>
      </PortalAuthLayout>
    );
  }

  if (!token || tokenRejected) {
    return (
      <PortalAuthLayout title={t('portal.reset.title')}>
        <Notice tone="error">
          <p className="font-medium">
            {t(token ? 'portal.reset.invalidTitle' : 'portal.reset.missingTitle')}
          </p>
          <p className="mt-0.5">
            {t(token ? 'portal.reset.invalidBody' : 'portal.reset.missingBody')}
          </p>
        </Notice>
        <div className="mt-4">
          <ButtonLink to="/portal/forgot-password" variant="secondary">
            {t('portal.reset.requestNew')}
          </ButtonLink>
        </div>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout
      title={t('portal.reset.title')}
      subtitle={t('portal.reset.subtitle')}
      footer={
        <Link className="font-medium text-primary underline" to="/portal/login">
          {t('portal.forgot.backToLogin')}
        </Link>
      }
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
          name="password"
          render={({ field }) => (
            <PasswordField
              label={t('portal.reset.newPassword')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={errors.password?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field }) => (
            <PasswordField
              label={t('portal.reset.confirmPassword')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={errors.confirm?.message}
              showPolicy={false}
            />
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('portal.reset.submitting') : t('portal.reset.submit')}
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
