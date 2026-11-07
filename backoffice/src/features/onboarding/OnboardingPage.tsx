import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { ONBOARDING_STEPS, pickLocalized, type OnboardingStep } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../auth/WorkspaceContext';
import { canUser } from '../../auth/permissions';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { markOnboardingSeen } from '../../lib/onboardingSeen';
import { PageHeader } from '../shared/PageHeader';
import { ProfileForm } from '../profile/ProfileForm';
import { useProfileQuery } from '../profile/api';
import { timeZoneOptions } from '../settings/ClinicSection';
import { useSettingsQuery, useUpdateSettingsMutation } from '../settings/api';
import {
  useCompleteOnboardingMutation,
  useInviteTeamMemberMutation,
  useOnboardingQuery,
  useOnboardingRolesQuery,
} from './api';

const CARD = 'rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card) sm:p-6';
const SYSTEM_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const;

const LINK_STEPS: Partial<Record<OnboardingStep, { to: string; action: string }>> = {
  hours: { to: '/settings/hours', action: 'openHours' },
  appointmentTypes: { to: '/settings/appointments', action: 'openTypes' },
  doctors: { to: '/doctors', action: 'openDoctors' },
};

function ClinicStep({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const toast = useToast();
  const settings = useSettingsQuery();
  const [update, state] = useUpdateSettingsMutation();
  const [address, setAddress] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const data = settings.data;
  const zones = useMemo(() => timeZoneOptions(data?.clinic.timezone ?? 'UTC'), [data]);

  if (settings.isLoading) return <Skeleton lines={3} />;
  if (!data) {
    return (
      <p role="alert" className="text-sm text-error">
        {t('onboarding.loadError')}
      </p>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update({
        clinic: {
          address: (address ?? data?.clinic.address ?? '').trim() || null,
          timezone: zone ?? data?.clinic.timezone,
        },
      } as never).unwrap();
      toast.success(t('onboarding.saved'));
      onDone();
    } catch {
      toast.error(t('onboarding.saveError'));
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted">
        {t('onboarding.clinic.nameHelp', {
          name: pickLocalized(data.clinic.nameI18n, lang, data.clinic.name),
        })}{' '}
        <Link className="font-medium text-primary underline" to="/settings/clinic">
          {t('onboarding.clinic.openSettings')}
        </Link>
      </p>
      <Field label={t('onboarding.clinic.address')}>
        <Input
          autoComplete="street-address"
          value={address ?? data.clinic.address ?? ''}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field label={t('onboarding.clinic.timezone')}>
        <Select value={zone ?? data.clinic.timezone} onChange={(e) => setZone(e.target.value)}>
          {zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={state.isLoading}>
        {state.isLoading ? t('onboarding.saving') : t('onboarding.saveContinue')}
      </Button>
    </form>
  );
}

function TeamStep() {
  const { t } = useTranslation();
  const toast = useToast();
  const { active } = useWorkspace();
  const roles = useOnboardingRolesQuery();
  const [invite, state] = useInviteTeamMemberMutation();
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState<string>('RECEPTIONIST');
  const [error, setError] = useState<string | null>(null);

  // System roles always; the clinic's custom roles when the roles endpoint answers.
  const options = useMemo(() => {
    const fromApi = roles.data?.roles.filter(
      (r) => r.baseRole !== 'SUPER_ADMIN' && r.key !== 'SUPER_ADMIN',
    );
    if (fromApi && fromApi.length > 0) {
      return fromApi.map((r) => ({
        value: r.key,
        label: r.displayName || t(`roles.${r.key}`, { defaultValue: r.key }),
      }));
    }
    return SYSTEM_ROLES.map((key) => ({ value: key, label: t(`roles.${key}`) }));
  }, [roles.data, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.includes('@')) {
      setError(t('onboarding.team.emailInvalid'));
      return;
    }
    if (!active?.clinicId) {
      setError(t('onboarding.team.noClinic'));
      return;
    }
    try {
      await invite({ email: email.trim(), clinicId: active.clinicId, roleKey }).unwrap();
      toast.success(t('onboarding.team.sent', { email: email.trim() }));
      setEmail('');
    } catch {
      setError(t('onboarding.team.error'));
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted">{t('onboarding.team.body')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('onboarding.team.email')} error={error ?? undefined}>
          <Input
            type="email"
            dir="ltr"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('onboarding.team.role')}>
          <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={state.isLoading}>
        {state.isLoading ? t('onboarding.saving') : t('onboarding.team.send')}
      </Button>
    </form>
  );
}

/** First-run wizard: a progress rail on the left (top on small screens) and one step at a time. */
export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const state = useOnboardingQuery();
  const profile = useProfileQuery();
  const [complete, completing] = useCompleteOnboardingMutation();
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => markOnboardingSeen(), []);

  const steps = useMemo(
    () =>
      [...(state.data?.steps ?? [])].sort(
        (a, b) => ONBOARDING_STEPS.indexOf(a.key) - ONBOARDING_STEPS.indexOf(b.key),
      ),
    [state.data],
  );
  const isAdmin = canUser(user, 'manageSettings');
  const current = Math.min(
    index ??
      Math.max(
        0,
        steps.findIndex((s) => !s.done),
      ),
    Math.max(0, steps.length - 1),
  );
  const step = steps[current];
  const doneCount = steps.filter((s) => s.done).length;

  async function finish() {
    markOnboardingSeen();
    try {
      if (isAdmin) await complete({ scope: 'clinic' }).unwrap();
      await complete({ scope: 'user' }).unwrap();
      navigate('/', { replace: true });
    } catch {
      toast.error(t('onboarding.completeError'));
    }
  }

  const next = () => setIndex(Math.min(current + 1, steps.length - 1));

  let body: ReactNode = null;
  if (step) {
    const link = LINK_STEPS[step.key];
    if (step.key === 'profile') {
      body = profile.data ? (
        <ProfileForm
          profile={profile.data}
          submitLabel={t('onboarding.saveContinue')}
          onSaved={next}
        />
      ) : profile.isError ? (
        <p role="alert" className="text-sm text-error">
          {t('onboarding.loadError')}
        </p>
      ) : (
        <Skeleton lines={4} />
      );
    } else if (step.key === 'clinic') {
      body = <ClinicStep onDone={next} />;
    } else if (step.key === 'team') {
      body = <TeamStep />;
    } else if (link) {
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t(`onboarding.steps.${step.key}.body`)}</p>
          <Link
            to={link.to}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
          >
            {t(`onboarding.${link.action}`)}
          </Link>
        </div>
      );
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('onboarding.eyebrow')}
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        actions={
          <Button
            variant="ghost"
            disabled={completing.isLoading}
            onClick={async () => {
              markOnboardingSeen();
              try {
                if (isAdmin) await complete({ scope: 'clinic' }).unwrap();
                await complete({ scope: 'user' }).unwrap();
              } catch {
                // Skipping must never trap the user: the seen flag already prevents a redirect.
              }
              navigate('/', { replace: true });
            }}
          >
            {t('onboarding.skip')}
          </Button>
        }
      />
      {state.isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('onboarding.loading')}
          className="space-y-3"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-48" />
        </div>
      ) : state.isError || !step ? (
        <ErrorState
          title={t('onboarding.loadError')}
          action={
            <Button variant="secondary" onClick={() => void state.refetch()}>
              {t('profile.retry')}
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label={t('onboarding.progress')} className={CARD}>
            <p className="mb-3 text-xs font-semibold text-muted" aria-live="polite">
              {t('onboarding.progressCount', { done: doneCount, total: steps.length })}
            </p>
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === current ? 'step' : undefined}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-start text-sm ${
                      i === current
                        ? 'bg-accent font-semibold text-primary'
                        : 'text-text hover:bg-bg'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${
                        s.done ? 'border-success bg-success text-white' : 'border-border-strong'
                      }`}
                    >
                      {s.done ? <Check size={14} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {t(`onboarding.steps.${s.key}.title`)}
                    </span>
                    <span className="sr-only">
                      {s.done ? t('onboarding.done') : t('onboarding.todo')}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <section aria-labelledby="onboarding-step" className={`${CARD} min-w-0`}>
            <h2 id="onboarding-step" className="text-lg font-semibold text-text">
              {t(`onboarding.steps.${step.key}.title`)}
            </h2>
            <p className="mb-5 mt-1 text-sm text-muted">{t(`onboarding.steps.${step.key}.lead`)}</p>
            {body}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                variant="secondary"
                disabled={current === 0}
                onClick={() => setIndex(current - 1)}
              >
                {t('onboarding.back')}
              </Button>
              {current < steps.length - 1 ? (
                <Button variant="ghost" onClick={next}>
                  {t('onboarding.next')}
                  <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                </Button>
              ) : (
                <Button onClick={() => void finish()} disabled={completing.isLoading}>
                  {t('onboarding.finish')}
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
