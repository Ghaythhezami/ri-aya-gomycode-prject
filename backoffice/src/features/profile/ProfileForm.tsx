import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { normalizeLocalized, type ProfileDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { useToast } from '../../common/Toast';
import { useUpdateProfileMutation } from './api';
import { profileDefaults, profileSchema, type ProfileValues } from './forms';

/**
 * Names (one input per language), job title, phone and language. Shared by the profile page
 * and the onboarding wizard. Saving a new language switches the interface to it.
 */
export function ProfileForm({
  profile,
  submitLabel,
  onSaved,
}: {
  profile: ProfileDto;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { refreshUser } = useAuth();
  const [update, state] = useUpdateProfileMutation();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: profileDefaults(profile),
    mode: 'onTouched',
  });
  const { errors } = form.formState;

  // Follow server data after a save or refetch unless the user is mid-edit.
  const defaultsKey = JSON.stringify(profileDefaults(profile));
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(profileDefaults(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await update({
        firstNameI18n: normalizeLocalized(values.firstNameI18n),
        lastNameI18n: normalizeLocalized(values.lastNameI18n),
        jobTitle: values.jobTitle.trim() || null,
        phone: values.phone.trim() || null,
        preferredLocale: values.preferredLocale,
      }).unwrap();
      form.reset(profileDefaults(saved));
      toast.success(t('profile.saved'));
      if (values.preferredLocale !== (i18n.resolvedLanguage ?? i18n.language).slice(0, 2)) {
        await i18n.changeLanguage(values.preferredLocale);
      }
      await refreshUser();
      onSaved?.();
    } catch (error) {
      const message = (error as { message?: string } | undefined)?.message;
      toast.error(message || t('profile.saveError'));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Controller
        control={form.control}
        name="firstNameI18n"
        render={({ field }) => (
          <LocalizedInput
            label={t('profile.firstName')}
            name="firstName"
            required
            autoComplete="given-name"
            value={field.value}
            onChange={(next) => field.onChange(next)}
            onBlur={field.onBlur}
            error={(errors.firstNameI18n as { message?: string } | undefined)?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="lastNameI18n"
        render={({ field }) => (
          <LocalizedInput
            label={t('profile.lastName')}
            name="lastName"
            required
            autoComplete="family-name"
            value={field.value}
            onChange={(next) => field.onChange(next)}
            onBlur={field.onBlur}
            error={(errors.lastNameI18n as { message?: string } | undefined)?.message}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('profile.jobTitle')} error={errors.jobTitle?.message}>
          <Input autoComplete="organization-title" {...form.register('jobTitle')} />
        </Field>
        <Field label={t('profile.phone')} error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" dir="ltr" {...form.register('phone')} />
        </Field>
      </div>
      <Field label={t('profile.language')} help={t('profile.languageHelp')}>
        <Select {...form.register('preferredLocale')}>
          <option value="en">{t('localized.languages.en')}</option>
          <option value="fr">{t('localized.languages.fr')}</option>
          <option value="ar">{t('localized.languages.ar')}</option>
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={state.isLoading}>
          {state.isLoading ? t('profile.saving') : (submitLabel ?? t('profile.save'))}
        </Button>
      </div>
    </form>
  );
}
