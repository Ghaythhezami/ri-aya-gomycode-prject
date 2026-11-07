import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Field, Input } from '../../common/Input';
import { ConsentBox } from '../components/Consent';
import { PasswordField } from '../components/PasswordField';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { ButtonLink, Notice } from '../components/ui';
import { authErrorKind, lockoutMinutes, type AuthErrorKind } from '../lib/authErrors';
import { inviteSchema, type InviteForm } from '../lib/schemas';
import { usePortalAuth } from '../PortalAuthContext';

/** Reads `#token=` (or legacy `?token=`) from the URL, then removes it with `replaceState`. */
export function readInviteToken(): string {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  const token = hash.get('token') ?? search.get('token') ?? '';
  if (token) {
    search.delete('token');
    const query = search.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }
  return token;
}

/** `/portal/invite#token=`: attaches a portal account to the record created by the front desk. */
export function PortalInvitePage() {
  const { t } = useTranslation();
  const { acceptInvite } = usePortalAuth();
  // The token travels in the fragment (never sent to the server); `?token=` is a legacy fallback.
  // Read once, then scrub it from the address bar and history.
  const [token] = useState(readInviteToken);
  const [failure, setFailure] = useState<AuthErrorKind | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      dateOfBirth: '',
      email: '',
      password: '',
      acceptPrivacy: false,
      aiConsent: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await acceptInvite({
        token,
        dateOfBirth: values.dateOfBirth,
        email: values.email.trim(),
        password: values.password,
        acceptPrivacy: true,
        aiConsent: values.aiConsent,
      });
    } catch (error) {
      setFailure(authErrorKind(error));
      setMinutes(lockoutMinutes(error));
    }
  });

  if (!token) {
    return (
      <PortalAuthLayout title={t('portal.invite.title')}>
        <Notice tone="error">
          <p className="font-medium">{t('portal.invite.missingTitle')}</p>
          <p className="mt-0.5">{t('portal.invite.missingBody')}</p>
        </Notice>
        <div className="mt-4">
          <ButtonLink to="/portal/login" variant="secondary">
            {t('portal.login.submit')}
          </ButtonLink>
        </div>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout
      title={t('portal.invite.title')}
      subtitle={t('portal.invite.subtitle')}
      footer={
        <Link className="font-medium text-primary underline" to="/portal/login">
          {t('portal.invite.haveAccount')}
        </Link>
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
          name="dateOfBirth"
          render={({ field }) => (
            <div>
              <DatePicker
                label={t('portal.fields.dateOfBirth')}
                value={field.value}
                onChange={field.onChange}
                max={new Date().toISOString().slice(0, 10)}
                invalid={Boolean(errors.dateOfBirth)}
              />
              <p className="mt-1 text-xs text-muted">{t('portal.invite.dobHelp')}</p>
              {errors.dateOfBirth?.message ? (
                <span role="alert" className="mt-1 block text-sm text-error">
                  {t(errors.dateOfBirth.message)}
                </span>
              ) : null}
            </div>
          )}
        />
        <Field
          label={t('portal.fields.email')}
          help={t('portal.invite.emailHelp')}
          error={errors.email?.message}
        >
          <Input
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
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
            />
          )}
        />
        <Controller
          control={control}
          name="acceptPrivacy"
          render={({ field }) => (
            <ConsentBox
              required
              checked={field.value}
              onChange={field.onChange}
              title={t('portal.consent.privacyTitle')}
              body={t('portal.consent.privacyBody')}
              error={errors.acceptPrivacy?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="aiConsent"
          render={({ field }) => (
            <ConsentBox
              checked={field.value}
              onChange={field.onChange}
              title={t('portal.consent.aiTitle')}
              body={t('portal.consent.aiBody')}
            />
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('portal.invite.submitting') : t('portal.invite.submit')}
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
