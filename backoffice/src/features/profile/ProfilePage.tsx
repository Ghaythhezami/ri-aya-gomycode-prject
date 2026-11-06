import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { ErrorState } from '../../common/States';
import { Skeleton } from '../../common/Skeleton';
import { useToast } from '../../common/Toast';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../shared/PageHeader';
import { useChangePasswordMutation, useProfileQuery } from './api';
import { groupCapabilities, profileDisplayName } from './display';
import { passwordSchema, type PasswordValues } from './forms';
import { ProfileForm } from './ProfileForm';

const CARD = 'rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card) sm:p-6';

function PasswordSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [change, state] = useChangePasswordMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await change({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();
      form.reset();
      toast.success(t('profile.password.changed'));
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      setServerError(
        code === 'WEAK_PASSWORD'
          ? t('profile.errors.weakPassword')
          : code === 'INVALID_CREDENTIALS'
            ? t('profile.password.wrongCurrent')
            : t('profile.password.error'),
      );
    }
  });

  return (
    <section aria-labelledby="profile-password" className={CARD}>
      <h2 id="profile-password" className="text-base font-semibold text-text">
        {t('profile.password.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('profile.password.help')}</p>
      <form onSubmit={submit} noValidate className="mt-4 grid max-w-md gap-4">
        <Field label={t('profile.password.current')} error={errors.currentPassword?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            {...form.register('currentPassword')}
          />
        </Field>
        <Field label={t('profile.password.new')} error={errors.newPassword?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
        </Field>
        <Field label={t('profile.password.confirm')} error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        </Field>
        {serverError ? (
          <p role="alert" className="text-sm text-error">
            {serverError}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={state.isLoading}>
            {state.isLoading ? t('profile.saving') : t('profile.password.submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** My profile: edit own details, change the password, review access (read only). */
export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const query = useProfileQuery();
  const profile = query.data;
  const capabilities = profile?.capabilities ?? user?.capabilities ?? [];
  const groups = groupCapabilities(capabilities);

  return (
    <div>
      <PageHeader
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        subtitle={profile ? profileDisplayName(profile, i18n.language) : t('profile.subtitle')}
      />
      {query.isLoading ? (
        <div className="space-y-4" role="status" aria-busy="true" aria-label={t('profile.loading')}>
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      ) : query.isError || !profile ? (
        <ErrorState
          title={t('profile.loadError')}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {t('profile.retry')}
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="profile-details" className={CARD}>
              <h2 id="profile-details" className="mb-4 text-base font-semibold text-text">
                {t('profile.details')}
              </h2>
              <ProfileForm profile={profile} />
            </section>
            <PasswordSection />
          </div>
          <aside aria-labelledby="profile-access" className={CARD}>
            <h2 id="profile-access" className="text-base font-semibold text-text">
              {t('profile.access')}
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted">{t('profile.email')}</dt>
                <dd className="break-all text-text" dir="ltr">
                  {profile.email}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('profile.role')}</dt>
                <dd className="font-medium text-text">{profile.roleName}</dd>
              </div>
            </dl>
            <h3 className="mt-5 text-sm font-semibold text-text">{t('profile.capabilities')}</h3>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('profile.noCapabilities')}</p>
            ) : (
              <div className="mt-2 space-y-3">
                {groups.map(({ group, items }) => (
                  <div key={group}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t(`profile.groups.${group}`, { defaultValue: group })}
                    </h4>
                    <ul className="mt-1 list-disc ps-5 text-sm text-text">
                      {items.map((item) => (
                        <li key={item}>{t(`profile.caps.${item}`, { defaultValue: item })}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
