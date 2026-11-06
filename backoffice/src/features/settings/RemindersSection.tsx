import { useMemo } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ClinicSettingsDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import {
  MAX_REMINDERS,
  remindersDefaults,
  remindersPayload,
  remindersSchema,
  type RemindersValues,
} from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';

/** SET-1 section 5: when reminders go out and over which channels. */
export function RemindersSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t } = useTranslation();
  const defaults = useMemo(() => remindersDefaults(settings), [settings]);
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<RemindersValues>({
    schema: remindersSchema,
    defaults,
    build: (values) => remindersPayload(values, defaults),
    fields: ['reminderOffsets', 'reminderChannels', 'offsets', 'hours', 'sms', 'email'],
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'offsets' });
  const errors = form.formState.errors;

  return (
    <SectionCard
      title={t('settings.reminders.title')}
      subtitle={t('settings.reminders.subtitle')}
      dirty={dirty}
      saving={saving}
      general={general}
      onSubmit={onSubmit}
      onCancel={cancel}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-text">
          {t('settings.reminders.offsets')}
        </legend>
        <p className="mb-3 text-sm text-muted">
          {t('settings.reminders.offsetsHelp', { max: MAX_REMINDERS })}
        </p>
        {fields.length === 0 && (
          <p className="text-sm text-muted">{t('settings.reminders.none')}</p>
        )}
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-end gap-3">
              <div className="w-48">
                <Field
                  label={t('settings.reminders.hoursBefore', { n: index + 1 })}
                  error={errors.offsets?.[index]?.hours?.message}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min={0.25}
                    max={168}
                    dir="ltr"
                    {...form.register(`offsets.${index}.hours`, { valueAsNumber: true })}
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => remove(index)}
                aria-label={t('settings.reminders.remove', { n: index + 1 })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {errors.offsets?.message && (
          <p role="alert" className="mt-2 text-sm text-error">
            {t(errors.offsets.message)}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={fields.length >= MAX_REMINDERS}
          onClick={() => append({ hours: 1 }, { shouldFocus: true })}
        >
          <Plus size={16} aria-hidden="true" />
          {t('settings.reminders.add')}
        </Button>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="mb-2 text-sm font-semibold text-text">
          {t('settings.reminders.channels')}
        </legend>
        <div className="space-y-1">
          <label className="flex min-h-10 items-center gap-3 text-sm text-text">
            <input type="checkbox" className="size-4 accent-primary" {...form.register('sms')} />
            {t('settings.reminders.sms')}
          </label>
          <label className="flex min-h-10 items-center gap-3 text-sm text-text">
            <input type="checkbox" className="size-4 accent-primary" {...form.register('email')} />
            {t('settings.reminders.email')}
          </label>
          <label className="flex min-h-10 items-center gap-3 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-primary" checked disabled readOnly />
            {t('settings.reminders.inApp')}
          </label>
        </div>
        <p className="mt-2 text-sm text-muted">{t('settings.reminders.inAppHelp')}</p>
      </fieldset>
    </SectionCard>
  );
}
