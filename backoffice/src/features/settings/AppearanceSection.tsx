import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicSettingsDto } from '@riaya/shared';
import { applyAppearance, storeAppearance } from './appearance';
import {
  appearanceDefaults,
  appearancePayload,
  appearanceSchema,
  type AppearanceValues,
} from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';

/** SET-1 section 8: density, contrast and motion, previewed live through data attributes on <html>. */
export function AppearanceSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t } = useTranslation();
  const defaults = useMemo(() => appearanceDefaults(settings), [settings]);
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<AppearanceValues>({
    schema: appearanceSchema,
    defaults,
    build: (values) => {
      const payload = appearancePayload(values, defaults);
      if (Object.keys(payload).length > 0) storeAppearance(values);
      return payload;
    },
    fields: ['appearance', 'density', 'highContrast', 'reduceMotion'],
  });
  const saved = useRef(defaults);
  saved.current = defaults;

  useEffect(() => {
    const sub = form.watch((values) => applyAppearance(values as AppearanceValues));
    return () => {
      sub.unsubscribe();
      // Leaving the section drops any preview that was not saved.
      applyAppearance(saved.current);
    };
  }, [form]);

  const density = form.watch('density');

  return (
    <SectionCard
      title={t('settings.appearance.title')}
      subtitle={t('settings.appearance.subtitle')}
      dirty={dirty}
      saving={saving}
      general={general}
      onSubmit={onSubmit}
      onCancel={() => {
        cancel();
        applyAppearance(defaults);
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text">
          {t('settings.appearance.density')}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['comfortable', 'compact'] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-md border p-4 text-sm ${
                density === value ? 'border-primary bg-accent' : 'border-border'
              }`}
            >
              <input
                type="radio"
                value={value}
                className="mt-0.5 size-4 accent-primary"
                {...form.register('density')}
              />
              <span>
                <span className="block font-medium text-text">
                  {t(`settings.appearance.${value}`)}
                </span>
                <span className="block text-muted">{t(`settings.appearance.${value}Help`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 space-y-3">
        <label className="flex min-h-10 items-start gap-3 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register('highContrast')}
          />
          <span>
            <span className="block font-medium">{t('settings.appearance.contrast')}</span>
            <span className="block text-muted">{t('settings.appearance.contrastHelp')}</span>
          </span>
        </label>
        <label className="flex min-h-10 items-start gap-3 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register('reduceMotion')}
          />
          <span>
            <span className="block font-medium">{t('settings.appearance.motion')}</span>
            <span className="block text-muted">{t('settings.appearance.motionHelp')}</span>
          </span>
        </label>
      </div>
    </SectionCard>
  );
}
