import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../auth/WorkspaceContext';
import { api } from '../../lib/api';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { SettingsCard, SettingsSkeleton } from './SettingsCard';
import { LANGUAGES, TIME_ZONES, type ClinicSettings, type ClinicSettingsUpdate } from './types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}

/**
 * Clinic information (BP-035).
 *
 * The form is loaded from `GET /api/clinics/settings` and saved with `PATCH`.
 * Cancel restores the last saved copy, so an abandoned edit never leaks into the
 * next section.
 */
export function ClinicInformationSection() {
  const { t } = useTranslation();
  const { active, renameClinic } = useWorkspace();
  const [form, setForm] = useState<ClinicSettings | null>(null);
  const [saved, setSaved] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<ClinicSettings>('/api/clinics/settings')
      .then(({ data }) => {
        if (cancelled) return;
        setForm(data);
        setSaved(data);
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

  function update(key: keyof ClinicSettings) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setForm((current) => (current ? { ...current, [key]: value } : current));
      setNotice(null);
      setError(null);
    };
  }

  const nameValid = Boolean(form && form.name.trim().length >= 2);
  const emailValid = Boolean(
    form && (form.contactEmail.trim() === '' || EMAIL.test(form.contactEmail.trim())),
  );
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const canSave = Boolean(form && dirty && nameValid && emailValid && !saving);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !canSave) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const payload: ClinicSettingsUpdate = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      phone: form.phone.trim() || null,
      defaultLanguage: form.defaultLanguage,
      timezone: form.timezone,
    };

    try {
      const { data } = await api.patch<ClinicSettings>('/api/clinics/settings', payload);
      setForm(data);
      setSaved(data);
      setSavedOnce(true);
      renameClinic(data.id, data.name);
      setNotice(t('settings.saved'));
    } catch (err) {
      const code = errorCode(err);
      setError(
        code === 'INVALID_TIMEZONE'
          ? t('settings.invalidTimeZone')
          : code === 'CLINIC_NAME_REQUIRED'
            ? t('settings.nameRequired')
            : t('settings.saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!saved) return;
    setForm(saved);
    setError(null);
    setNotice(null);
  }

  const title = t('settings.clinicInformation');
  const description = t('settings.updateConfig', {
    clinic: form?.name || active?.clinicName || '',
  });

  if (loading && !form) {
    return (
      <SettingsCard title={title} description={description} badge={t('settings.draft')}>
        <SettingsSkeleton />
      </SettingsCard>
    );
  }

  if (!form) {
    return (
      <SettingsCard title={title} description={description}>
        <p role="alert" className="text-sm text-error">
          {error ?? t('settings.loadError')}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          {t('settings.retry')}
        </Button>
      </SettingsCard>
    );
  }

  const zones = Array.from(new Set<string>([...TIME_ZONES, form.timezone]));

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
          <Button type="submit" form="clinic-information-form" disabled={!canSave}>
            {saving ? t('settings.saving') : t('settings.saveChanges')}
          </Button>
        </>
      }
    >
      <form id="clinic-information-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t('settings.clinicName')}
            error={nameValid ? undefined : 'settings.nameRequired'}
          >
            <Input value={form.name} onChange={update('name')} required maxLength={120} />
          </Field>
          <Field label={t('settings.clinicId')}>
            <Input value={form.id} readOnly className="bg-bg font-mono text-xs" />
          </Field>

          <div className="md:col-span-2">
            <Field label={t('settings.address')}>
              <Input value={form.address} onChange={update('address')} maxLength={200} />
            </Field>
          </div>

          <Field
            label={t('settings.contactEmail')}
            error={emailValid ? undefined : 'settings.invalidEmail'}
          >
            <Input
              type="email"
              value={form.contactEmail}
              onChange={update('contactEmail')}
              maxLength={200}
            />
          </Field>
          <Field label={t('settings.phoneNumber')}>
            <Input type="tel" value={form.phone} onChange={update('phone')} maxLength={30} />
          </Field>

          <Field label={t('settings.defaultLanguage')}>
            <Select
              value={form.defaultLanguage}
              onChange={(event) => {
                const value = event.target.value as ClinicSettings['defaultLanguage'];
                setForm((current) => (current ? { ...current, defaultLanguage: value } : current));
                setNotice(null);
                setError(null);
              }}
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {t(`settings.languages.${language}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.timeZone')}>
            <Select value={form.timezone} onChange={update('timezone')}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {notice ? (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </form>
    </SettingsCard>
  );
}
