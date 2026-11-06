import { useTranslation } from 'react-i18next';
import type { Control, UseFormRegister } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Siren } from 'lucide-react';
import type { AppointmentTypeDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { sortTypes, typeToken } from '../shared/appointmentTypes';
import { Field, Input, Select, Textarea } from '../../common/Input';
import type { BookingForm } from './schema';

const DURATIONS = [10, 15, 20, 30, 40, 45, 60, 90];

export function DetailsStep({
  control,
  register,
  errors,
  duration,
  durationFor,
  types,
  typesLoading,
  typesError,
  onRetryTypes,
  onType,
}: {
  control: Control<BookingForm>;
  register: UseFormRegister<BookingForm>;
  errors: Partial<Record<keyof BookingForm, { message?: string }>>;
  /** Current duration, so a non-standard value stays selectable. */
  duration: number;
  /** Reference duration for a type. */
  durationFor: (type: string) => number;
  /** Active clinic types, undefined while loading. */
  types: AppointmentTypeDto[] | undefined;
  typesLoading: boolean;
  typesError: boolean;
  onRetryTypes: () => void;
  onType: (type: string, duration: number) => void;
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
            {typesError ? (
              <div role="alert" className="text-sm text-error">
                {t('booking.details.typesError')}{' '}
                <Button type="button" variant="secondary" size="sm" onClick={onRetryTypes}>
                  {t('clinic.retry')}
                </Button>
              </div>
            ) : typesLoading ? (
              <p className="text-sm text-muted" aria-busy="true">
                {t('booking.details.typesLoading')}
              </p>
            ) : !types?.length ? (
              <p className="text-sm text-muted">{t('booking.details.typesEmpty')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {sortTypes(types).map((type) => (
                  <button
                    key={type.code}
                    type="button"
                    aria-pressed={field.value === type.code}
                    onClick={() => {
                      field.onChange(type.code);
                      onType(type.code, durationFor(type.code));
                    }}
                    className={`min-h-12 rounded-lg border px-3 py-1.5 text-start text-sm transition ${
                      field.value === type.code
                        ? 'border-primary bg-accent font-semibold text-primary'
                        : 'border-border bg-surface text-text hover:bg-bg'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: typeToken(type.color, type.code) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{type.displayName}</span>
                      {type.isEmergency ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-alert/10 px-1.5 text-xs font-medium text-alert">
                          <Siren size={12} aria-hidden="true" />
                          {t('booking.details.emergency')}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs font-normal text-muted">
                      {t('clinic.minutes', { count: type.durationMinutes })}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
