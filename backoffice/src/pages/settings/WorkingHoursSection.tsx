import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useWorkspace } from '../../auth/WorkspaceContext';
import { api } from '../../lib/api';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { SettingsCard, SettingsSkeleton } from './SettingsCard';
import {
  WEEKDAYS,
  defaultWorkingHours,
  type ClinicSettings,
  type ClinicWorkingHours,
  type Weekday,
  type WorkingHoursDay,
} from './types';

function cloneWeek(week: ClinicWorkingHours): ClinicWorkingHours {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, { ...week[day], breaks: week[day].breaks.map((b) => ({ ...b })) }]),
  ) as ClinicWorkingHours;
}

/**
 * Weekly operating hours (BP-035).
 *
 * Each day can be open or closed, can hold several breaks, and is saved as one
 * JSON document with the rest of the week. The server repeats the validation,
 * so a client cannot store an end time before its start.
 */
export function WorkingHoursSection() {
  const { t } = useTranslation();
  const { active } = useWorkspace();
  const [week, setWeek] = useState<ClinicWorkingHours | null>(null);
  const [saved, setSaved] = useState<ClinicWorkingHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ClinicSettings>('/api/clinics/settings')
      .then(({ data }) => {
        if (cancelled) return;
        const next = cloneWeek(data.workingHours ?? defaultWorkingHours());
        setWeek(next);
        setSaved(next);
      })
      .catch(() => {
        if (!cancelled) setError(t('settings.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function updateDay(day: Weekday, patch: Partial<ClinicWorkingHours[Weekday]>) {
    setWeek((current) =>
      current ? { ...current, [day]: { ...current[day], ...patch } } : current,
    );
    setNotice(null);
    setError(null);
  }

  function updateBreak(day: Weekday, index: number, key: 'start' | 'end', value: string) {
    setWeek((current) => {
      if (!current) return current;
      const breaks = current[day].breaks.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      );
      return { ...current, [day]: { ...current[day], breaks } };
    });
    setNotice(null);
    setError(null);
  }

  function addBreak(day: Weekday) {
    setWeek((current) => {
      if (!current) return current;
      return {
        ...current,
        [day]: {
          ...current[day],
          breaks: [...current[day].breaks, { start: '12:00', end: '13:00' }],
        },
      };
    });
    setNotice(null);
    setError(null);
  }

  function removeBreak(day: Weekday, index: number) {
    setWeek((current) => {
      if (!current) return current;
      return {
        ...current,
        [day]: {
          ...current[day],
          breaks: current[day].breaks.filter((_, itemIndex) => itemIndex !== index),
        },
      };
    });
    setNotice(null);
    setError(null);
  }

  function breakConflict(day: WorkingHoursDay): boolean {
    const sorted = [...day.breaks].sort((left, right) => left.start.localeCompare(right.start));
    for (let index = 1; index < sorted.length; index += 1) {
      // A break that starts before the previous one ends is either a duplicate
      // (same start/end) or an overlap; both are rejected.
      if (sorted[index].start < sorted[index - 1].end) return true;
    }
    return false;
  }

  function weekIssue(candidate: ClinicWorkingHours): 'invalid-time' | 'duplicate-break' | null {
    for (const day of WEEKDAYS) {
      const value = candidate[day];
      if (!value.open) continue;
      if (value.start >= value.end) return 'invalid-time';
      for (const pause of value.breaks) {
        if (pause.start >= pause.end || pause.start < value.start || pause.end > value.end) {
          return 'invalid-time';
        }
      }
      if (breakConflict(value)) return 'duplicate-break';
    }
    return null;
  }

  const dirty = Boolean(week && saved && JSON.stringify(week) !== JSON.stringify(saved));
  const canSave = Boolean(week && dirty && !saving);
  const description = t('settings.updateConfig', { clinic: active?.clinicName ?? '' });

  async function save() {
    if (!week || !canSave) return;
    const issue = weekIssue(week);
    if (issue === 'duplicate-break') {
      setError(t('settings.duplicateBreak'));
      return;
    }
    if (issue === 'invalid-time') {
      setError(t('settings.invalidHours'));
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await api.patch<ClinicSettings>('/api/clinics/settings', {
        workingHours: week,
      });
      const next = cloneWeek(data.workingHours ?? week);
      setWeek(next);
      setSaved(next);
      setSavedOnce(true);
      setNotice(t('settings.hoursSaved'));
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(
        code === 'INVALID_BREAKS' ? t('settings.duplicateBreak') : t('settings.hoursSaveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!saved) return;
    setWeek(cloneWeek(saved));
    setError(null);
    setNotice(null);
  }

  const title = t('settings.workingHours');

  if (loading && !week) {
    return (
      <SettingsCard title={title} description={description} badge={t('settings.draft')}>
        <SettingsSkeleton />
      </SettingsCard>
    );
  }

  if (!week) {
    return (
      <SettingsCard title={title} description={description}>
        <p role="alert" className="text-sm text-error">
          {error ?? t('settings.loadError')}
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title={title}
      description={description}
      badge={dirty || !savedOnce ? t('settings.draft') : t('settings.savedBadge')}
      badgeTone={dirty || !savedOnce ? 'info' : 'success'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={cancel} disabled={!dirty || saving}>
            {t('settings.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {saving ? t('settings.saving') : t('settings.saveChanges')}
          </Button>
        </>
      }
    >
      <div>
        {WEEKDAYS.map((day) => {
          const value = week[day];
          const dayLabel = t(`settings.days.${day}`);
          return (
            <div
              key={day}
              className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="grid gap-3 md:grid-cols-[140px_1fr] md:items-start">
                <p className="pt-2 text-sm font-medium text-text">{dayLabel}</p>

                {value.open ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-28">
                        <Input
                          type="time"
                          value={value.start}
                          aria-label={`${t('settings.start')} ${dayLabel}`}
                          onChange={(event) => updateDay(day, { start: event.target.value })}
                        />
                      </div>
                      <span className="text-sm text-muted">{t('settings.to')}</span>
                      <div className="w-28">
                        <Input
                          type="time"
                          value={value.end}
                          aria-label={`${t('settings.end')} ${dayLabel}`}
                          onChange={(event) => updateDay(day, { end: event.target.value })}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => addBreak(day)}>
                        {t('settings.addBreak')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateDay(day, { open: false })}
                      >
                        {t('settings.closeDay')}
                      </Button>
                    </div>

                    {value.breaks.map((pause, index) => (
                      <div
                        key={`${day}-${index}`}
                        className="flex flex-wrap items-center gap-2 ps-2 sm:ps-6"
                      >
                        <span className="text-xs text-muted">{t('settings.break')}</span>
                        <div className="w-28">
                          <Input
                            type="time"
                            value={pause.start}
                            aria-label={`${t('settings.breakStart')} ${dayLabel}`}
                            onChange={(event) =>
                              updateBreak(day, index, 'start', event.target.value)
                            }
                          />
                        </div>
                        <span className="text-sm text-muted">{t('settings.to')}</span>
                        <div className="w-28">
                          <Input
                            type="time"
                            value={pause.end}
                            aria-label={`${t('settings.breakEnd')} ${dayLabel}`}
                            onChange={(event) => updateBreak(day, index, 'end', event.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${t('settings.removeBreak')} ${dayLabel}`}
                          onClick={() => removeBreak(day, index)}
                        >
                          <X size={16} aria-hidden="true" />
                        </Button>
                      </div>
                    ))}

                    {breakConflict(value) ? (
                      <p role="status" className="ps-2 text-sm text-error sm:ps-6">
                        {t('settings.duplicateBreak')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted">{t('settings.closed')}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateDay(day, { open: true })}
                    >
                      {t('settings.openDay')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {notice ? (
          <p role="status" className="mt-4 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
