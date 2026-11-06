import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicSettingsDto } from '@riaya/shared';
import { Input } from '../../common/Input';
import { useClinicFormat } from '../shared/format';
import { hoursDefaults, hoursPayload, hoursSchema, type HoursValues } from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';

/** SET-1 section 3: clinic opening hours per weekday. */
export function HoursSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const defaults = useMemo(() => hoursDefaults(settings), [settings]);
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<HoursValues>({
    schema: hoursSchema,
    defaults,
    build: (values) => hoursPayload(values, defaults, settings.openingHours),
    fields: ['openingHours', 'days', 'open', 'close', 'closed'],
  });
  const days = form.watch('days');
  const errors = form.formState.errors.days;
  // 2024-01-07 was a Sunday, so weekday 0 maps to it.
  const dayName = (weekday: number) =>
    new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + weekday)));

  return (
    <SectionCard
      title={t('settings.hours.title')}
      subtitle={t('settings.hours.subtitle')}
      dirty={dirty}
      saving={saving}
      general={general}
      onSubmit={onSubmit}
      onCancel={cancel}
    >
      <ul className="divide-y divide-border">
        {days.map((day, index) => {
          const closeError = errors?.[index]?.close?.message;
          const base = `days.${index}` as const;
          return (
            <li key={day.weekday} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
              <span className="w-32 text-sm font-medium text-text">{dayName(day.weekday)}</span>
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  {...form.register(`${base}.closed`)}
                />
                {t('settings.hours.closed')}
              </label>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`open-${index}`}>
                  {t('settings.hours.opens', { day: dayName(day.weekday) })}
                </label>
                <Input
                  id={`open-${index}`}
                  type="time"
                  dir="ltr"
                  className="w-32"
                  disabled={day.closed}
                  {...form.register(`${base}.open`)}
                />
                <span aria-hidden="true" className="text-muted">
                  –
                </span>
                <label className="sr-only" htmlFor={`close-${index}`}>
                  {t('settings.hours.closes', { day: dayName(day.weekday) })}
                </label>
                <Input
                  id={`close-${index}`}
                  type="time"
                  dir="ltr"
                  className="w-32"
                  disabled={day.closed}
                  invalid={Boolean(closeError)}
                  aria-describedby={closeError ? `close-err-${index}` : undefined}
                  {...form.register(`${base}.close`)}
                />
              </div>
              {closeError && (
                <span
                  id={`close-err-${index}`}
                  role="alert"
                  className="basis-full text-sm text-error"
                >
                  {t(closeError)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
