import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  APPOINTMENT_TYPE_COLORS,
  type AppointmentTypeDto,
  type AppointmentTypeInput,
} from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { Modal } from '../../common/Modal';
import {
  TYPE_MAX_MINUTES,
  TYPE_MIN_MINUTES,
  TYPE_STEP_MINUTES,
  colorVar,
  typeDefaults,
  typeFormSchema,
  typePayload,
  type TypeFormValues,
} from './appointmentTypes';

/** Create or edit an appointment type. System types keep their code and emergency flag. */
export function AppointmentTypeModal({
  type,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  type?: AppointmentTypeDto;
  saving: boolean;
  error?: string | null;
  onSubmit: (payload: AppointmentTypeInput | Partial<AppointmentTypeInput>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const form = useForm<TypeFormValues>({
    resolver: zodResolver(typeFormSchema as never),
    defaultValues: typeDefaults(type),
    mode: 'onTouched',
  });
  const errors = form.formState.errors;
  const system = type?.isSystem ?? false;

  const submit = form.handleSubmit((values) => {
    const payload = typePayload(values, type);
    if (type && Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    onSubmit(payload);
  });

  return (
    <Modal
      open
      title={type ? t('settings.types.editTitle') : t('settings.types.createTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('clinic.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving} aria-busy={saving || undefined}>
            {saving ? t('settings.saving') : t('clinic.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-error">
            {error}
          </p>
        )}
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <LocalizedInput
              label={t('settings.types.name')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.name?.message as string | undefined}
              required
              name="name"
            />
          )}
        />
        {type && (
          <p className="text-sm text-muted">
            {t('settings.types.code')}: <span className="font-mono">{type.code}</span>
          </p>
        )}
        <Field
          label={`${t('settings.types.duration')} (${t('settings.appointments.minutesUnit')})`}
          help={t('settings.types.durationHelp')}
          error={errors.durationMinutes?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={TYPE_MIN_MINUTES}
            max={TYPE_MAX_MINUTES}
            step={TYPE_STEP_MINUTES}
            {...form.register('durationMinutes', { valueAsNumber: true })}
          />
        </Field>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-text">
                {t('settings.types.colour')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {APPOINTMENT_TYPE_COLORS.map((color) => (
                  <label
                    key={color}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-text ${
                      field.value === color ? 'border-primary bg-accent' : 'border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="color"
                      className="size-4 accent-primary"
                      checked={field.value === color}
                      onChange={() => field.onChange(color)}
                      onBlur={field.onBlur}
                    />
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-full border border-border-strong"
                      style={{ backgroundColor: colorVar(color) }}
                    />
                    {t(`settings.types.colours.${color}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />
        <label className="flex min-h-10 items-start gap-3 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            disabled={system}
            {...form.register('isEmergency')}
          />
          <span>
            <span className="block font-medium">{t('settings.types.emergency')}</span>
            <span className="block text-muted">
              {system ? t('settings.types.emergencyLocked') : t('settings.types.emergencyHelp')}
            </span>
          </span>
        </label>
        <label className="flex min-h-10 items-start gap-3 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register('isActive')}
          />
          <span>
            <span className="block font-medium">{t('settings.types.active')}</span>
            <span className="block text-muted">{t('settings.types.activeHelp')}</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
