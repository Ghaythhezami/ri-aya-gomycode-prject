import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import type { LocalizedText, PortalMe } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { isLocalizedFilled, LocalizedInput } from '../../common/LocalizedInput';
import { ConsentBox } from '../components/Consent';
import { PortalAuthLayout } from '../components/PortalAuthLayout';
import { Notice } from '../components/ui';
import {
  COUNTED_STEPS,
  canLeaveStep,
  nextStep,
  previousStep,
  stepNumber,
  type OnboardingStep,
} from '../lib/onboarding';
import { isPhoneValid } from '../lib/schemas';
import { portalErrorMessage } from '../lib/session';
import { usePortalAuth } from '../PortalAuthContext';

/** First-run flow: profile, reminders, assistant consent, optional first booking, done. */
export function PortalWelcomePage() {
  const { me } = usePortalAuth();
  if (!me) return null;
  return <Welcome me={me} />;
}

function Welcome({ me }: { me: PortalMe }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { updateMe } = usePortalAuth();
  const [step, setStep] = useState<OnboardingStep>('profile');
  const finishing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState<LocalizedText>(me.firstNameI18n);
  const [lastName, setLastName] = useState<LocalizedText>(me.lastNameI18n);
  const [phone, setPhone] = useState(me.phone);
  const [locale, setLocale] = useState<'en' | 'fr' | 'ar'>(me.preferredLocale);
  const [contact, setContact] = useState<'SMS' | 'EMAIL'>(
    me.contactPreference === 'EMAIL' ? 'EMAIL' : 'SMS',
  );
  const [ai, setAi] = useState(me.aiConsent);
  const [touched, setTouched] = useState(false);

  // The header language switcher and this step's language field are the same choice:
  // follow a switch made in the header so saving the step does not revert it.
  useEffect(() => {
    const onChange = (lng: string) => {
      const next = lng.slice(0, 2);
      if (next === 'en' || next === 'fr' || next === 'ar') setLocale(next);
    };
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, [i18n]);

  const profileOk = {
    hasName: isLocalizedFilled(firstName) && isLocalizedFilled(lastName),
    phoneValid: isPhoneValid(phone),
  };

  // Already onboarded (e.g. a stale tab): leave, unless this flow is the one finishing.
  useEffect(() => {
    if (me.onboardingCompleted && !finishing.current && step !== 'done') {
      navigate('/portal', { replace: true });
    }
  }, [me.onboardingCompleted, step, navigate]);

  async function save(patch: Parameters<typeof updateMe>[0]): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      await updateMe(patch);
      return true;
    } catch (e) {
      setError(portalErrorMessage(e, t('portal.common.saveFailed')));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function advance() {
    if (!canLeaveStep(step, profileOk)) {
      setTouched(true);
      return;
    }
    let ok = true;
    if (step === 'profile') {
      ok = await save({
        firstNameI18n: firstName,
        lastNameI18n: lastName,
        phone: phone.trim(),
        preferredLocale: locale,
      });
      if (ok && locale !== i18n.resolvedLanguage) void i18n.changeLanguage(locale);
    } else if (step === 'preferences') {
      ok = await save({ contactPreference: contact });
    } else if (step === 'assistant') {
      ok = await save({ aiConsent: ai });
    }
    if (ok) setStep(nextStep(step));
  }

  async function finish(goToBooking: boolean) {
    finishing.current = true;
    const ok = await save({ onboardingCompleted: true });
    if (!ok) {
      finishing.current = false;
      return;
    }
    if (goToBooking) navigate('/portal/book', { replace: true });
    else setStep('done');
  }

  if (step === 'done') {
    return (
      <PortalAuthLayout
        title={t('portal.welcome.doneTitle')}
        subtitle={t('portal.welcome.doneBody')}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 size={48} className="text-success" aria-hidden />
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate('/portal', { replace: true })}
          >
            {t('portal.welcome.goHome')}
          </Button>
        </div>
      </PortalAuthLayout>
    );
  }

  const number = stepNumber(step);
  const lastStep = step === 'appointment';

  return (
    <PortalAuthLayout
      wide
      title={t('portal.welcome.title', { name: me.firstName })}
      subtitle={t(`portal.welcome.steps.${step}.hint`)}
    >
      <ol className="mb-6 flex gap-2" aria-label={t('portal.welcome.progress')}>
        {COUNTED_STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === step ? 'step' : undefined}
            className={`flex-1 rounded-full px-2 py-1 text-center text-xs ${
              s === step
                ? 'bg-primary font-semibold text-white'
                : i + 1 < number
                  ? 'bg-accent text-primary'
                  : 'bg-bg text-muted'
            }`}
          >
            <span aria-hidden>{i + 1 < number ? '✓ ' : ''}</span>
            <span className="sr-only">
              {t('portal.welcome.stepOf', { current: i + 1, total: COUNTED_STEPS.length })}:{' '}
            </span>
            <span className="hidden sm:inline">{t(`portal.welcome.steps.${s}.title`)}</span>
            <span className="sm:hidden" aria-hidden>
              {i + 1}
            </span>
          </li>
        ))}
      </ol>

      <h2 className="mb-4 text-lg font-semibold text-text">
        {t(`portal.welcome.steps.${step}.title`)}
      </h2>

      <div className="space-y-5">
        {step === 'profile' ? (
          <>
            <LocalizedInput
              label={t('portal.fields.firstName')}
              required
              value={firstName}
              onChange={setFirstName}
              error={
                touched && !isLocalizedFilled(firstName)
                  ? 'portal.validation.nameRequired'
                  : undefined
              }
            />
            <LocalizedInput
              label={t('portal.fields.lastName')}
              required
              value={lastName}
              onChange={setLastName}
              error={
                touched && !isLocalizedFilled(lastName)
                  ? 'portal.validation.nameRequired'
                  : undefined
              }
            />
            <Field
              label={t('portal.fields.phone')}
              error={
                touched && !profileOk.phoneValid ? 'portal.validation.phoneInvalid' : undefined
              }
            >
              <Input
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label={t('portal.fields.language')}>
              <Select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'en' | 'fr' | 'ar')}
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </Select>
            </Field>
          </>
        ) : null}

        {step === 'preferences' ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text">
              {t('portal.fields.reminders')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
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
                    onChange={() => setContact(value)}
                  />
                  <span className="text-sm font-medium text-text">
                    {t(`portal.contact.${value}`)}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{t('portal.welcome.remindersHelp')}</p>
          </fieldset>
        ) : null}

        {step === 'assistant' ? (
          <ConsentBox
            checked={ai}
            onChange={setAi}
            title={t('portal.consent.aiTitle')}
            body={t('portal.consent.aiBody')}
          />
        ) : null}

        {step === 'appointment' ? (
          <div className="rounded-lg border border-border bg-bg p-4 text-center">
            <CalendarPlus size={32} className="mx-auto text-primary" aria-hidden />
            <p className="mt-2 text-sm text-text">{t('portal.welcome.bookBody')}</p>
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={saving}
              onClick={() => void finish(true)}
            >
              {t('portal.welcome.bookNow')}
            </Button>
          </div>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving || step === 'profile'}
            onClick={() => setStep(previousStep(step))}
          >
            {t('portal.common.back')}
          </Button>
          {lastStep ? (
            <Button variant="secondary" disabled={saving} onClick={() => void finish(false)}>
              {saving ? t('portal.common.saving') : t('portal.welcome.skipBooking')}
            </Button>
          ) : (
            <Button disabled={saving} onClick={() => void advance()}>
              {saving ? t('portal.common.saving') : t('portal.common.next')}
            </Button>
          )}
        </div>
      </div>
    </PortalAuthLayout>
  );
}
