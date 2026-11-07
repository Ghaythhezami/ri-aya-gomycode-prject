import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { useToast } from '../../common/Toast';
import { ConsentBox } from '../components/Consent';
import { Card, Notice, PageTitle } from '../components/ui';
import { fieldMessage, profileSchema, type ProfileForm } from '../lib/schemas';
import { portalErrorMessage } from '../lib/session';
import { usePortalAuth, usePortalMe } from '../PortalAuthContext';

export function PortalProfilePage() {
  const { t, i18n } = useTranslation();
  const me = usePortalMe();
  const { updateMe, logout } = usePortalAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<'SMS' | 'EMAIL'>(
    me.contactPreference === 'EMAIL' ? 'EMAIL' : 'SMS',
  );
  const [ai, setAi] = useState(me.aiConsent);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstNameI18n: me.firstNameI18n,
      lastNameI18n: me.lastNameI18n,
      phone: me.phone,
      preferredLocale: me.preferredLocale,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await updateMe({ ...values, phone: values.phone.trim() });
      if (values.preferredLocale !== i18n.resolvedLanguage)
        void i18n.changeLanguage(values.preferredLocale);
      toast.success(t('portal.profile.saved'));
    } catch (e) {
      setError(portalErrorMessage(e, t('portal.common.saveFailed')));
    }
  });

  async function savePrefs(patch: { contactPreference?: 'SMS' | 'EMAIL'; aiConsent?: boolean }) {
    setPrefsSaving(true);
    try {
      await updateMe(patch);
      toast.success(t('portal.profile.saved'));
    } catch (e) {
      // Roll the optimistic toggle back so the screen shows what is stored.
      setContact(me.contactPreference === 'EMAIL' ? 'EMAIL' : 'SMS');
      setAi(me.aiConsent);
      toast.error(portalErrorMessage(e, t('portal.common.saveFailed')));
    } finally {
      setPrefsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title={t('portal.profile.title')} description={me.email} />

      <Card aria-labelledby="profile-details">
        <h2 id="profile-details" className="mb-4 text-lg font-semibold text-text">
          {t('portal.profile.details')}
        </h2>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Controller
            control={control}
            name="firstNameI18n"
            render={({ field }) => (
              <LocalizedInput
                label={t('portal.fields.firstName')}
                required
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldMessage(errors.firstNameI18n)}
              />
            )}
          />
          <Controller
            control={control}
            name="lastNameI18n"
            render={({ field }) => (
              <LocalizedInput
                label={t('portal.fields.lastName')}
                required
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldMessage(errors.lastNameI18n)}
              />
            )}
          />
          <Field label={t('portal.fields.phone')} error={errors.phone?.message}>
            <Input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" {...register('phone')} />
          </Field>
          <Field label={t('portal.fields.language')}>
            <Select {...register('preferredLocale')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? t('portal.common.saving') : t('portal.common.save')}
          </Button>
        </form>
      </Card>

      <Card aria-labelledby="profile-reminders">
        <h2 id="profile-reminders" className="mb-3 text-lg font-semibold text-text">
          {t('portal.fields.reminders')}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="profile-reminders"
          className="grid gap-2 sm:grid-cols-2"
        >
          {(['SMS', 'EMAIL'] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                contact === value ? 'border-primary bg-accent' : 'border-border-strong'
              }`}
            >
              <input
                type="radio"
                name="contact"
                className="size-5 accent-primary"
                checked={contact === value}
                disabled={prefsSaving}
                onChange={() => {
                  setContact(value);
                  void savePrefs({ contactPreference: value });
                }}
              />
              <span className="text-sm font-medium text-text">{t(`portal.contact.${value}`)}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="profile-ai">
        <h2 id="profile-ai" className="mb-3 text-lg font-semibold text-text">
          {t('portal.profile.assistant')}
        </h2>
        <ConsentBox
          checked={ai}
          onChange={(value) => {
            setAi(value);
            void savePrefs({ aiConsent: value });
          }}
          title={t('portal.consent.aiTitle')}
          body={t('portal.consent.aiBody')}
        />
        <p className="mt-2 text-xs text-muted">{t('portal.profile.aiWithdraw')}</p>
      </Card>

      <Button
        variant="secondary"
        onClick={async () => {
          await logout().catch(() => undefined);
          navigate('/portal/login', { replace: true });
        }}
      >
        <LogOut size={16} aria-hidden />
        {t('portal.shell.logout')}
      </Button>
    </div>
  );
}
