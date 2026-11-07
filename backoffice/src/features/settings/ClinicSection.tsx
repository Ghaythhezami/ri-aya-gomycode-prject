import { useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { pickLocalized, type ClinicSettingsDto } from '@riaya/shared';
import { LocalizedInput } from '../../common/LocalizedInput';
import { Field, Input, Select } from '../../common/Input';
import { SearchableSelect } from '../../common/SearchableSelect';
import { clinicDefaults, clinicPayload, clinicSchema, type ClinicValues } from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';

const FALLBACK_ZONES = [
  'UTC',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Africa/Cairo',
  'Europe/Paris',
  'Europe/London',
];

export function timeZoneOptions(current: string): { value: string; label: string }[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (supported) zones = supported('timeZone');
  } catch {
    /* fall back to the short list */
  }
  const all = zones.includes(current) ? zones : [current, ...zones];
  if (!all.includes('UTC')) all.push('UTC');
  return all.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

/** SET-1 section 1: clinic information. */
export function ClinicSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const defaults = useMemo(() => clinicDefaults(settings), [settings]);
  const zones = useMemo(
    () => timeZoneOptions(settings.clinic.timezone),
    [settings.clinic.timezone],
  );
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<ClinicValues>({
    schema: clinicSchema,
    defaults,
    build: (values) => clinicPayload(values, defaults),
    fields: ['nameI18n', 'address', 'contactEmail', 'phone', 'defaultLanguage', 'timezone'],
  });
  const { register, control, formState } = form;
  const errors = formState.errors;

  return (
    <SectionCard
      title={t('settings.clinic.title')}
      subtitle={t('settings.clinic.subtitle', {
        name: pickLocalized(settings.clinic.nameI18n, lang, settings.clinic.name),
      })}
      dirty={dirty}
      saving={saving}
      general={general}
      onSubmit={onSubmit}
      onCancel={cancel}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="nameI18n"
            render={({ field }) => (
              <LocalizedInput
                mode="languages"
                label={t('settings.clinic.name')}
                required
                autoComplete="organization"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.nameI18n?.message ?? errors.nameI18n?.root?.message}
              />
            )}
          />
        </div>
        <Field label={t('settings.clinic.code')} help={t('settings.clinic.codeHelp')}>
          <Input value={settings.clinic.code} readOnly dir="ltr" className="bg-bg" />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('settings.clinic.address')} error={errors.address?.message}>
            <Input autoComplete="street-address" {...register('address')} />
          </Field>
        </div>
        <Field label={t('settings.clinic.email')} error={errors.contactEmail?.message}>
          <Input type="email" dir="ltr" autoComplete="email" {...register('contactEmail')} />
        </Field>
        <Field label={t('settings.clinic.phone')} error={errors.phone?.message}>
          <Input type="tel" dir="ltr" autoComplete="tel" {...register('phone')} />
        </Field>
        <Field label={t('settings.clinic.language')} error={errors.defaultLanguage?.message}>
          <Select {...register('defaultLanguage')}>
            {(['en', 'ar', 'fr'] as const).map((l) => (
              <option key={l} value={l}>
                {t(`settings.languages.${l}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Controller
            control={control}
            name="timezone"
            render={({ field }) => (
              <SearchableSelect
                label={t('settings.clinic.timezone')}
                options={zones}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                placeholder={t('settings.clinic.timezoneSearch')}
                noResultsLabel={t('clinic.noResults')}
              />
            )}
          />
          {errors.timezone?.message && (
            <span role="alert" className="mt-1 block text-sm text-error">
              {t(errors.timezone.message)}
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
