import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { APPOINTMENT_TYPES, type ClinicSettingsDto } from '@riaya/shared';
import { Field, Input, Select } from '../../common/Input';
import {
  SLOT_OPTIONS,
  appointmentsDefaults,
  appointmentsPayload,
  appointmentsSchema,
  type AppointmentsValues,
} from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';

/** SET-1 section 4: durations per type, slot size, cancellation policy. */
export function AppointmentsSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t } = useTranslation();
  const defaults = useMemo(() => appointmentsDefaults(settings), [settings]);
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<AppointmentsValues>({
    schema: appointmentsSchema,
    defaults,
    build: (values) => appointmentsPayload(values, defaults),
    fields: [
      ...APPOINTMENT_TYPES,
      'durations',
      'slotMinutes',
      'cancellationNoticeHours',
      'targetWaitMinutes',
      'requireCancelReason',
    ],
  });
  const errors = form.formState.errors;

  return (
    <SectionCard
      title={t('settings.appointments.title')}
      subtitle={t('settings.appointments.subtitle')}
      dirty={dirty}
      saving={saving}
      general={general}
      onSubmit={onSubmit}
      onCancel={cancel}
    >
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-text">
          {t('settings.appointments.durations')}
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
          {APPOINTMENT_TYPES.map((type) => (
            <Field
              key={type}
              label={`${t(`clinic.type.${type}`)} (${t('settings.appointments.minutesUnit')})`}
              error={errors.durations?.[type]?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={5}
                max={240}
                {...form.register(`durations.${type}`, { valueAsNumber: true })}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <Field
          label={t('settings.appointments.slot')}
          help={t('settings.appointments.slotHelp')}
          error={errors.slotMinutes?.message}
        >
          <Select {...form.register('slotMinutes', { valueAsNumber: true })}>
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('clinic.minutes', { count: m })}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('settings.appointments.notice')}
          help={t('settings.appointments.noticeHelp')}
          error={errors.cancellationNoticeHours?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={72}
            {...form.register('cancellationNoticeHours', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label={t('settings.appointments.targetWait')}
          help={t('settings.appointments.targetWaitHelp')}
          error={errors.targetWaitMinutes?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            {...form.register('targetWaitMinutes', { valueAsNumber: true })}
          />
        </Field>
      </div>

      <label className="mt-6 flex min-h-10 items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          {...form.register('requireCancelReason')}
        />
        <span>
          <span className="block font-medium">{t('settings.appointments.requireReason')}</span>
          <span className="block text-muted">{t('settings.appointments.requireReasonHelp')}</span>
        </span>
      </label>
    </SectionCard>
  );
}
