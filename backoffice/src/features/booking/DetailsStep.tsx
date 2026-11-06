import { useTranslation } from 'react-i18next';
import type { Control, UseFormRegister } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { APPOINTMENT_TYPES, type AppointmentType } from '@riaya/shared';
import { Field, Input, Select, Textarea } from '../../common/Input';
import type { BookingForm } from './schema';

const DURATIONS = [10, 15, 20, 30, 40, 45, 60, 90];

export function DetailsStep({
  control,
  register,
  errors,
  duration,
  durationFor,
  onType,
}: {
  control: Control<BookingForm>;
  register: UseFormRegister<BookingForm>;
  errors: Partial<Record<keyof BookingForm, { message?: string }>>;
  /** Current duration, so a non-standard value stays selectable. */
  duration: number;
  /** Reference duration for a type. */
  durationFor: (type: AppointmentType) => number;
  onType: (type: AppointmentType, duration: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-text">{t('booking.details.title')}</h3>

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-text">
              {t('booking.details.type')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {APPOINTMENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={field.value === type}
                  onClick={() => {
                    field.onChange(type);
                    onType(type, durationFor(type));
                  }}
                  className={`min-h-12 rounded-lg border px-3 text-sm transition ${
                    field.value === type
                      ? 'border-primary bg-accent font-semibold text-primary'
                      : 'border-border bg-surface text-text hover:bg-bg'
                  }`}
                >
                  {t(`clinic.type.${type}`)}
                  <span className="block text-xs font-normal text-muted">
                    {t('clinic.minutes', { count: durationFor(type) })}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      />

      <Field label={t('booking.details.duration')} error={errors.durationMinutes?.message}>
        <Select {...register('durationMinutes', { valueAsNumber: true })}>
          {(DURATIONS.includes(duration)
            ? DURATIONS
            : [...DURATIONS, duration].sort((a, b) => a - b)
          ).map((minutes) => (
            <option key={minutes} value={minutes}>
              {t('clinic.minutes', { count: minutes })}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('booking.details.reason')} error={errors.reason?.message}>
        <Input autoComplete="off" maxLength={500} {...register('reason')} />
      </Field>

      <Field label={t('booking.details.notes')} error={errors.notes?.message}>
        <Textarea rows={3} maxLength={1000} {...register('notes')} />
      </Field>

      <Controller
        control={control}
        name="reminderChannels"
        render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-text">
              {t('booking.details.reminders')}
            </legend>
            <div className="flex flex-wrap gap-3">
              {(['SMS', 'EMAIL'] as const).map((channel) => {
                const checked = field.value.includes(channel);
                return (
                  <label
                    key={channel}
                    className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        field.onChange(
                          checked
                            ? field.value.filter((value) => value !== channel)
                            : [...field.value, channel],
                        )
                      }
                    />
                    {t(`booking.details.channel.${channel}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      />
    </div>
  );
}
