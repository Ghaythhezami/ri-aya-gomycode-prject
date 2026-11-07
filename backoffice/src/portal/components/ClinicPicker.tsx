import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortalClinic } from '@riaya/shared';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { useClinicsQuery } from '../api';

/** Case- and accent-insensitive match on name and address. */
export function filterClinics(clinics: PortalClinic[], query: string): PortalClinic[] {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return clinics;
  return clinics.filter((c) => norm(`${c.name} ${c.address ?? ''}`).includes(q));
}

/**
 * Clinic chooser: a searchable radio group fed by `GET /portal/clinics`. The previously used
 * clinic (remembered in localStorage) arrives as `value`.
 */
export function ClinicPicker({
  value,
  onChange,
  error,
  requireSelfRegistration = false,
}: {
  value: string;
  onChange: (clinic: PortalClinic) => void;
  error?: string;
  requireSelfRegistration?: boolean;
}) {
  const { t } = useTranslation();
  const legendId = useId();
  const errorId = useId();
  const [query, setQuery] = useState('');
  const { data, isLoading, isError, refetch } = useClinicsQuery();

  const clinics = useMemo(
    () => (data ?? []).filter((c) => !requireSelfRegistration || c.selfRegistration),
    [data, requireSelfRegistration],
  );
  const visible = useMemo(() => filterClinics(clinics, query), [clinics, query]);

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title={t('portal.clinic.loadError')}
        description={t('portal.clinic.loadErrorHint')}
        action={
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('portal.common.retry')}
          </Button>
        }
      />
    );
  }
  if (clinics.length === 0) {
    return <EmptyState title={t('portal.clinic.none')} description={t('portal.clinic.noneHint')} />;
  }

  return (
    <div>
      <p id={legendId} className="mb-1.5 text-sm font-medium text-text">
        {t('portal.clinic.label')}
      </p>
      {clinics.length > 4 ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('portal.clinic.search')}
          aria-label={t('portal.clinic.search')}
          className="mb-2"
        />
      ) : null}
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        aria-describedby={error ? errorId : undefined}
        className="max-h-64 space-y-2 overflow-y-auto"
      >
        {visible.map((clinic) => {
          const checked = clinic.id === value;
          return (
            <label
              key={clinic.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                checked ? 'border-primary bg-accent' : 'border-border-strong bg-surface'
              }`}
            >
              <input
                type="radio"
                name="clinic"
                className="size-5 accent-primary"
                checked={checked}
                onChange={() => onChange(clinic)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{clinic.name}</span>
                {clinic.address ? (
                  <span className="block truncate text-xs text-muted">{clinic.address}</span>
                ) : null}
              </span>
              {checked ? (
                <span className="text-xs font-semibold text-primary">
                  <span aria-hidden>✓ </span>
                  {t('portal.clinic.selected')}
                </span>
              ) : null}
            </label>
          );
        })}
        {visible.length === 0 ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted" role="status">
            {t('portal.clinic.noResults')}
          </p>
        ) : null}
      </div>
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm text-error">
          {t(error)}
        </span>
      ) : null}
    </div>
  );
}
