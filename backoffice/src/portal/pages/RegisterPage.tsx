import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { PortalClinic } from '@riaya/shared';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Field, Input, Select } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { ClinicPicker } from '../components/ClinicPicker';
import { ConsentBox } from '../components/Consent';
import { PasswordField } from '../components/PasswordField';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { Notice } from '../components/ui';
import { authErrorKind, lockoutMinutes, type AuthErrorKind } from '../lib/authErrors';
import { fieldMessage, registerSchema, type RegisterForm } from '../lib/schemas';
import { usePortalAuth } from '../PortalAuthContext';

function currentLocale(language: string | undefined): 'en' | 'fr' | 'ar' {
  const l = (language ?? 'en').slice(0, 2);
  return l === 'ar' || l === 'fr' ? l : 'en';
}

/** Self-registration (ADR 0005 §1). Success signs the patient in and the guard opens onboarding. */
export function PortalRegisterPage() {
  const { t, i18n } = useTranslation();
  const { register: registerAccount } = usePortalAuth();
  const [clinic, setClinic] = useState<PortalClinic | null>(null);
  const [failure, setFailure] = useState<AuthErrorKind | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      clinicId: '',
      firstNameI18n: {},
      lastNameI18n: {},
      dateOfBirth: '',
      phone: '',
      email: '',
      password: '',
      preferredLocale: currentLocale(i18n.resolvedLanguage),
      acceptPrivacy: false,
      aiConsent: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await registerAccount(
        {
          ...values,
          firstNameI18n: clean(values.firstNameI18n),
          lastNameI18n: clean(values.lastNameI18n),
          phone: values.phone.trim(),
          email: values.email.trim(),
          acceptPrivacy: true,
        },
        clinic ? { id: clinic.id, name: clinic.name, timezone: clinic.timezone } : undefined,
      );
    } catch (error) {
      setFailure(authErrorKind(error));
      setMinutes(lockoutMinutes(error));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  return (
    <PortalAuthLayout
      wide
      title={t('portal.register.title')}
      subtitle={t('portal.register.subtitle')}
      footer={
        <>
          {t('portal.register.haveAccount')}{' '}
          <Link className="font-medium text-primary underline" to="/portal/login">
            {t('portal.register.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {failure ? (
          <Notice tone="error">
            <p className="font-medium">{t(`portal.authErrors.${failure}.title`)}</p>
            <p className="mt-0.5">
              {failure === 'locked' && minutes
                ? t('portal.authErrors.lockedRetry', { minutes })
                : t(`portal.authErrors.${failure}.body`)}
            </p>
            {failure === 'exists' ? (
              <Link className="mt-1 inline-block font-medium underline" to="/portal/login">
                {t('portal.register.signIn')}
              </Link>
            ) : null}
          </Notice>
        ) : null}

        <Controller
          control={control}
          name="clinicId"
          render={({ field }) => (
            <ClinicPicker
              requireSelfRegistration
              value={field.value}
              error={errors.clinicId?.message}
              onChange={(c) => {
                setClinic(c);
                field.onChange(c.id);
              }}
            />
          )}
        />

        <fieldset className="space-y-4">
          <legend className="mb-2 text-base font-semibold text-text">
            {t('portal.register.aboutYou')}
          </legend>
          <Controller
            control={control}
            name="firstNameI18n"
            render={({ field }) => (
              <LocalizedInput
                label={t('portal.fields.firstName')}
                required
                autoComplete="given-name"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldMessage(errors.firstNameI18n)}
                help={t('portal.fields.nameHelp')}
              />
            )}
          />
          <Controller
            control={control}
            name="lastNameI18n"
            render={({ field }) => (
              <LocalizedInput
                label={t('portal.fields.lastName')}
                required
                autoComplete="family-name"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldMessage(errors.lastNameI18n)}
              />
            )}
          />
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
                {errors.dateOfBirth?.message ? (
                  <span role="alert" className="mt-1 block text-sm text-error">
                    {t(errors.dateOfBirth.message)}
                  </span>
                ) : null}
              </div>
            )}
          />
          <Field label={t('portal.fields.phone')} error={errors.phone?.message}>
            <Input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" {...register('phone')} />
          </Field>
          <Field label={t('portal.fields.language')}>
            <Select {...register('preferredLocale')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-2 text-base font-semibold text-text">
            {t('portal.register.account')}
          </legend>
          <Field label={t('portal.fields.email')} error={errors.email?.message}>
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
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-base font-semibold text-text">
            {t('portal.register.consents')}
          </legend>
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
        </fieldset>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('portal.register.submitting') : t('portal.register.submit')}
        </Button>
      </form>
    </PortalAuthLayout>
  );
}

function clean(value: Partial<Record<'en' | 'fr' | 'ar', string>>) {
  const out: Partial<Record<'en' | 'fr' | 'ar', string>> = {};
  for (const key of ['en', 'fr', 'ar'] as const) {
    const v = value[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}
