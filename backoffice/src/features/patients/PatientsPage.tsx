import { useEffect, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PatientListItem } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Input, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import { usePatientsQuery } from './api';
import { AddPatientModal } from './AddPatientModal';
import { useDebounced, useMediaQuery } from './hooks';
import { PatientPreview } from './PatientPreview';
import { PatientStatusBadge } from './PatientStatusBadge';

const LIMIT = 20;
const COLUMNS = [
  { key: 'name', label: 'patients.columns.patient' },
  { key: 'contact', label: 'patients.columns.contact' },
  { key: 'lastVisit', label: 'patients.columns.lastVisit' },
  { key: 'nextAppointment', label: 'patients.columns.nextAppointment' },
  { key: 'status', label: 'patients.columns.status' },
] as const;
const SORTABLE = new Set(['name', 'lastVisit', 'nextAppointment', 'status']);

export function PatientsPage() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const desktop = useMediaQuery('(min-width: 1024px)');

  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'ACTIVE';
  const gender = params.get('gender') ?? '';
  const sort = params.get('sort') ?? 'name';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debounced !== q) update({ q: debounced, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, isLoading, isFetching, isError, refetch } = usePatientsQuery({
    search: q || undefined,
    status: status || undefined,
    gender: gender || undefined,
    sort,
    page,
    limit: LIMIT,
  });

  const filtered = Boolean(q || gender || status !== 'ACTIVE');
  const reset = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const toggleSort = (key: string) => {
    update({ sort: sort === key ? `-${key}` : key, page: null });
  };
  const ariaSort = (key: string) => {
    if (!SORTABLE.has(key)) return undefined;
    if (sort === key) return 'ascending' as const;
    if (sort === `-${key}`) return 'descending' as const;
    return 'none' as const;
  };

  const open = (patient: PatientListItem) => {
    if (desktop) setSelectedId(patient.id);
    else navigate(`/patients/${patient.id}`);
  };
  const rowKey = (event: KeyboardEvent, patient: PatientListItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(patient);
    }
  };

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  let body;
  if (isError) {
    body = (
      <ErrorState
        title={t('patients.error.title')}
        description={t('patients.error.body')}
        action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
      />
    );
  } else if (isLoading) {
    body = (
      <div className="space-y-3 p-4" aria-busy="true" aria-label={t('clinic.loading')}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (items.length === 0 && filtered) {
    body = (
      <EmptyState
        icon={<Search size={18} />}
        title={t('patients.noResults.title')}
        description={
          q ? t('patients.noResults.query', { query: q }) : t('patients.noResults.filters')
        }
        action={
          <Button variant="secondary" onClick={reset}>
            {t('patients.noResults.reset')}
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<Users size={18} />}
        title={t('patients.empty.title')}
        description={t('patients.empty.body')}
        action={<Button onClick={() => setAdding(true)}>{t('patients.add.button')}</Button>}
      />
    );
  } else {
    body = (
      <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-start text-sm">
            <caption className="sr-only">{t('patients.title')}</caption>
            <thead className="border-b border-border bg-bg text-xs uppercase tracking-wide text-muted">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort(col.key)}
                    className="px-4 py-2 font-medium"
                  >
                    {SORTABLE.has(col.key) ? (
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center gap-1 uppercase"
                        onClick={() => toggleSort(col.key)}
                      >
                        {t(col.label)}
                        <span aria-hidden="true" className="text-[10px]">
                          {sort === col.key ? '▲' : sort === `-${col.key}` ? '▼' : '↕'}
                        </span>
                      </button>
                    ) : (
                      t(col.label)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  tabIndex={0}
                  aria-selected={selectedId === p.id}
                  onClick={() => open(p)}
                  onKeyDown={(e) => rowKey(e, p)}
                  className={`cursor-pointer border-t border-border hover:bg-bg ${
                    selectedId === p.id ? 'bg-accent' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar initials={p.initials} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">{p.name}</p>
                        <p className="text-xs text-muted" dir="ltr">
                          {p.code}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text" dir="ltr">
                    <span className="inline-block text-start">{p.phoneMasked}</span>
                  </td>
                  <td className="px-4 py-3 text-text">
                    {p.lastVisit ? fmt.date(p.lastVisit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {p.nextAppointment ? fmt.dateTime(p.nextAppointment) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <PatientStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-2 p-3 md:hidden" aria-label={t('patients.title')}>
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/patients/${p.id}`}
                className="block rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar initials={p.initials} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">{p.name}</p>
                    <p className="text-xs text-muted" dir="ltr">
                      {p.code} · {p.phoneMasked}
                    </p>
                  </div>
                  <PatientStatusBadge status={p.status} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {t('patients.columns.nextAppointment')}:{' '}
                  {p.nextAppointment ? fmt.dateTime(p.nextAppointment) : '—'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <nav
          aria-label={t('patients.pagination.label')}
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
        >
          <p className="text-muted" aria-live="polite">
            {t('patients.pagination.status', { page, pages: totalPages, total: data?.total ?? 0 })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => update({ page: String(page - 1) })}
              aria-label={t('patients.pagination.previous')}
            >
              <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => update({ page: String(page + 1) })}
              aria-label={t('patients.pagination.next')}
            >
              <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('patients.eyebrow')}
        title={t('patients.title')}
        subtitle={t('patients.subtitle')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" />
            {t('patients.add.button')}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
          <div className="flex flex-wrap gap-3 p-4">
            <div className="relative min-w-56 flex-1">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-3 text-muted"
              />
              <Input
                type="search"
                className="ps-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('patients.search.placeholder')}
                aria-label={t('patients.search.label')}
              />
            </div>
            <div className="w-40">
              <Select
                value={status}
                aria-label={t('patients.filters.status')}
                onChange={(e) => update({ status: e.target.value, page: null })}
              >
                <option value="ACTIVE">{t('patients.status.ACTIVE')}</option>
                <option value="ARCHIVED">{t('patients.status.ARCHIVED')}</option>
              </Select>
            </div>
            <div className="w-40">
              <Select
                value={gender}
                aria-label={t('patients.filters.gender')}
                onChange={(e) => update({ gender: e.target.value, page: null })}
              >
                <option value="">{t('patients.filters.allGenders')}</option>
                <option value="female">{t('patients.gender.female')}</option>
                <option value="male">{t('patients.gender.male')}</option>
              </Select>
            </div>
          </div>
          {body}
          <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden="true" className="text-primary" />
            {t('patients.privacy')}
          </p>
        </section>
        <aside
          aria-label={t('patients.preview.label')}
          className="hidden self-start rounded-lg border border-border bg-surface shadow-(--shadow-card) lg:sticky lg:top-4 lg:block"
        >
          <PatientPreview patientId={selectedId} />
        </aside>
      </div>
      <AddPatientModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          navigate(`/patients/${id}`);
        }}
      />
    </div>
  );
}
