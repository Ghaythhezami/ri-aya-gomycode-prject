import { useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Clock,
  LayoutGrid,
  Plus,
  Rows3,
  Search,
  Stethoscope,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { can } from '@riaya/shared';
import type { DoctorCard } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { DataTable, type Column } from '../../common/Table';
import { Input, Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useClinicReferenceQuery } from '../shared/api';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import { useDebounced } from '../patients/hooks';
import { useDoctorsQuery } from './api';
import { AvailabilityChip, UtilisationBar } from './AvailabilityChip';
import { DoctorFormModal } from './DoctorFormModal';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

const VIEW_KEY = 'riaya.doctors.view';
type View = 'cards' | 'table';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

export function DoctorsPage() {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const fmt = useClinicFormat();
  const { user } = useAuth();
  const canManage = user ? can(user.role, 'manageDoctors') : false;
  const { data: reference } = useClinicReferenceQuery();

  const [view, setView] = useState<View>(readView);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [date, setDate] = useState(() => fmt.localDate());
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search, 300);

  const { data, isLoading, isError, refetch } = useDoctorsQuery({
    date,
    search: debounced || undefined,
    specialty: specialty || undefined,
  });

  const chooseView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage unavailable: the choice just is not remembered */
    }
  };

  const doctors = data ?? [];
  const filtered = Boolean(debounced || specialty);

  const columns: Column<DoctorCard>[] = [
    {
      key: 'name',
      header: t('doctors.columns.name'),
      sortable: true,
      sortValue: (d) => d.name,
      render: (d) => (
        <Link to={`/doctors/${d.id}`} className="flex items-center gap-3 text-text">
          <Avatar initials={d.initials} size="sm" />
          <span className="font-medium">{d.name}</span>
        </Link>
      ),
    },
    { key: 'specialty', header: t('doctors.columns.specialty'), sortable: true },
    {
      key: 'availability',
      header: t('doctors.columns.availability'),
      sortable: true,
      render: (d) => <AvailabilityChip availability={d.availability} />,
    },
    {
      key: 'hoursLabel',
      header: t('doctors.columns.hours'),
      render: (d) => <span dir="ltr">{d.hoursLabel ?? t('doctors.noHours')}</span>,
    },
    {
      key: 'appointmentsCount',
      header: t('doctors.columns.appointments'),
      sortable: true,
      render: (d) => fmt.number(d.appointmentsCount),
    },
    {
      key: 'utilisation',
      header: t('doctors.columns.utilisation'),
      sortable: true,
      render: (d) => (
        <div className="flex min-w-28 items-center gap-2">
          <UtilisationBar
            value={d.utilisation}
            label={t('doctors.utilisationOf', { name: d.name })}
          />
          <span className="text-xs text-muted">{fmt.number(Math.round(d.utilisation))}%</span>
        </div>
      ),
    },
  ];

  let body;
  if (isError) {
    body = (
      <ErrorState
        title={t('doctors.error.title')}
        description={t('doctors.error.body')}
        action={<Button onClick={() => void refetch()}>{t('clinic.retry')}</Button>}
      />
    );
  } else if (isLoading) {
    body = (
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
        aria-label={t('clinic.loading')}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-60 w-full" />
        ))}
      </div>
    );
  } else if (doctors.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={<Search size={18} />}
        title={t('doctors.noResults.title')}
        description={t('doctors.noResults.body', { query: debounced || specialtyLabel(specialty) })}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setSpecialty('');
            }}
          >
            {t('doctors.noResults.reset')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Stethoscope size={18} />}
        title={t('doctors.empty.title')}
        description={t('doctors.empty.body')}
        action={
          canManage ? (
            <Button onClick={() => setAdding(true)}>{t('doctors.add')}</Button>
          ) : undefined
        }
      />
    );
  } else if (view === 'table') {
    body = (
      <DataTable
        columns={columns}
        rows={doctors}
        caption={t('doctors.title')}
        emptyLabel={t('clinic.noResults')}
      />
    );
  } else {
    body = (
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {doctors.map((d) => (
          <li
            key={d.id}
            className="flex flex-col items-center rounded-lg border border-border bg-surface p-5 text-center shadow-(--shadow-card)"
          >
            <div className="flex items-center gap-2">
              <Avatar initials={d.initials} size="lg" />
              <AvailabilityChip availability={d.availability} />
            </div>
            <h2 className="mt-3 text-base font-semibold text-text">{d.name}</h2>
            <p className="text-sm text-muted">{specialtyLabel(d.specialty)}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li className="flex items-center justify-center gap-2">
                <Clock size={14} aria-hidden="true" />
                <span dir="ltr">{d.hoursLabel ?? t('doctors.noHours')}</span>
              </li>
              <li className="flex items-center justify-center gap-2">
                <CalendarDays size={14} aria-hidden="true" />
                {t('doctors.appointmentsCount', { count: d.appointmentsCount })}
              </li>
            </ul>
            <div className="mt-4 w-full max-w-56">
              <p className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{t('doctors.utilisation')}</span>
                <span className="font-semibold text-text">
                  {fmt.number(Math.round(d.utilisation))}%
                </span>
              </p>
              <UtilisationBar
                value={d.utilisation}
                label={t('doctors.utilisationOf', { name: d.name })}
              />
            </div>
            <Link
              to={`/doctors/${d.id}`}
              className="mt-4 inline-flex min-h-10 items-center gap-1 border-t border-border pt-3 text-sm font-medium text-primary"
            >
              {t('doctors.viewSchedule')}
              <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('doctors.eyebrow')}
        title={t('doctors.title')}
        subtitle={t('doctors.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" />
              {t('doctors.add')}
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
            placeholder={t('doctors.search.placeholder')}
            aria-label={t('doctors.search.label')}
          />
        </div>
        <div className="w-48">
          <Select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            aria-label={t('doctors.filters.specialty')}
          >
            <option value="">{t('doctors.filters.allSpecialties')}</option>
            {(reference?.specialties ?? []).map((s) => (
              <option key={s} value={s}>
                {specialtyLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <DatePicker
            value={date}
            onChange={(v) => v && setDate(v)}
            label={t('doctors.filters.date')}
          />
        </div>
        <div
          role="group"
          aria-label={t('doctors.view.label')}
          className="flex rounded-md border border-border bg-surface p-1"
        >
          {(['cards', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => chooseView(v)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded px-3 text-sm font-medium ${
                view === v ? 'bg-primary text-white' : 'text-muted'
              }`}
            >
              {v === 'cards' ? (
                <LayoutGrid size={14} aria-hidden="true" />
              ) : (
                <Rows3 size={14} aria-hidden="true" />
              )}
              {t(`doctors.view.${v}`)}
            </button>
          ))}
        </div>
      </div>
      {body}
      <DoctorFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
