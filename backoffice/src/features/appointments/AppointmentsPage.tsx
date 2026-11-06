import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { can } from '@riaya/shared';
import type { AppointmentListItem } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Dropdown, type MenuItem } from '../../common/Dropdown';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { openBooking } from '../booking/booking-launcher';
import { todayInZone } from '../calendar/dates';
import { Avatar } from '../shared/Avatar';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import { StatusBadge, TypeLabel } from '../shared/StatusBadge';
import { useClinicReferenceQuery } from '../shared/api';
import { useApptListQuery } from './api';
import { allowedActions, canBulkCancel, canBulkConfirm, type RowAction } from './actions';
import { AppointmentsToolbar } from './AppointmentsToolbar';
import { CancelDialog } from './CancelDialog';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  effectiveSort,
  hasActiveFilters,
  nextSort,
  parseFilters,
  serializeFilters,
  toQuery,
  type AppointmentFilters,
  type SortField,
} from './filters';
import { RescheduleDialog, type RescheduleTarget } from './RescheduleDialog';
import { useAppointmentActions } from './useActions';

const COLUMNS: { field: SortField; labelKey: string; className?: string }[] = [
  { field: 'code', labelKey: 'appointments.columns.id', className: 'hidden xl:table-cell' },
  { field: 'patient', labelKey: 'appointments.columns.patient' },
  { field: 'doctor', labelKey: 'appointments.columns.doctor' },
  { field: 'startsAt', labelKey: 'appointments.columns.when' },
  { field: 'type', labelKey: 'appointments.columns.type' },
  { field: 'status', labelKey: 'appointments.columns.status' },
];

function SortHeader({
  field,
  label,
  sort,
  onSort,
  className = '',
}: {
  field: SortField;
  label: string;
  sort: string;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sort.replace(/^-/, '') === field;
  const descending = sort.startsWith('-');
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      aria-sort={!active ? 'none' : descending ? 'descending' : 'ascending'}
      className={`px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex min-h-10 items-center gap-1 uppercase tracking-wide"
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const format = useClinicFormat();
  const toast = useToast();
  const { user } = useAuth();
  const role = user?.role;
  const manage = can(role, 'manageAppointments');
  const reference = useClinicReferenceQuery();
  const { setStatus, cancel, bulk, errorText } = useAppointmentActions();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = todayInZone(format.timeZone);
  const locale = i18n.resolvedLanguage ?? 'en';
  const filters = useMemo(() => parseFilters(searchParams, today), [searchParams, today]);
  const sort = effectiveSort(filters);

  function update(partial: Partial<AppointmentFilters>) {
    const next = { ...filters, ...partial };
    if (!('page' in partial)) next.page = 1;
    setSearchParams(serializeFilters(next), { replace: true });
  }

  const { data, isFetching, isLoading, isError, error, refetch } = useApptListQuery(
    toQuery(filters),
    {
      pollingInterval: 60_000,
      skipPollingIfUnfocused: true,
    },
  );
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A page past the end (after a filter change or deletions) snaps back to the last page.
  useEffect(() => {
    if (data && filters.page > pages) update({ page: pages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pages]);

  // ---- selection ---------------------------------------------------------

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryKey = searchParams.toString();
  useEffect(() => setSelected(new Set()), [queryKey]);
  const visibleIds = items.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));
  const headerCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((item) => selected.has(item.id));

  // ---- dialogs and actions ----------------------------------------------

  const [cancelTarget, setCancelTarget] = useState<AppointmentListItem | null>(null);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

  function runAction(action: RowAction, item: AppointmentListItem) {
    if (action.kind === 'status') void setStatus(item.id, action.to);
    else if (action.kind === 'cancel') setCancelTarget(item);
    else
      setRescheduleTarget({
        id: item.id,
        doctor: item.doctor,
        startsAt: item.startsAt,
        durationMinutes: item.durationMinutes,
      });
  }

  function menuFor(item: AppointmentListItem): MenuItem[] {
    const base: MenuItem[] = [
      {
        id: 'view',
        label: t('appointments.actions.view'),
        onSelect: () => navigate(`/appointments/${item.id}`),
      },
    ];
    for (const action of allowedActions(role, item.status)) {
      base.push({
        id: `${action.kind}-${'to' in action ? action.to : ''}`,
        label: t(`appointments.actions.${action.labelKey}`),
        tone: action.kind === 'cancel' ? 'danger' : 'default',
        onSelect: () => runAction(action, item),
      });
    }
    return base;
  }

  async function bulkConfirm() {
    const ids = selectedItems.filter((item) => canBulkConfirm(item.status)).map((item) => item.id);
    if (ids.length === 0) {
      toast.info(t('appointments.bulk.noneEligible'));
      return;
    }
    try {
      await bulk(ids, 'CONFIRM');
      setSelected(new Set());
    } catch (raw) {
      toast.error(errorText(raw));
    }
  }

  const bulkCancelIds = selectedItems
    .filter((item) => canBulkCancel(item.status))
    .map((item) => item.id);

  // ---- render ------------------------------------------------------------

  const clinicError = asClinicError(error);
  const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(filters.page * PAGE_SIZE, total);
  const filtered = hasActiveFilters(filters);
  const doctorName =
    reference.data?.doctors.find((doctor) => doctor.id === filters.doctorId)?.name ?? '';

  const colSpan = manage ? 8 : 7;

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(filters.page - 2, pages - 4));
    return Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
  }, [filters.page, pages]);

  return (
    <div>
      <PageHeader
        eyebrow={t('appointments.eyebrow')}
        title={t('appointments.title')}
        subtitle={t('appointments.subtitle')}
        actions={
          manage ? (
            <Button onClick={() => openBooking()}>
              <Plus size={16} aria-hidden="true" />
              {t('appointments.create')}
            </Button>
          ) : null
        }
      />

      <section
        aria-label={t('appointments.title')}
        className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
      >
        <AppointmentsToolbar filters={filters} today={today} locale={locale} onChange={update} />

        {manage && selected.size > 0 ? (
          <div
            role="region"
            aria-label={t('appointments.bulk.label')}
            className="flex flex-wrap items-center gap-2 border-y border-border bg-accent px-4 py-2"
          >
            <span aria-live="polite" className="text-sm font-medium text-primary">
              {t('appointments.bulk.selected', { count: selected.size })}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void bulkConfirm()}>
              {t('appointments.bulk.confirm')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkCancelIds.length === 0}
              onClick={() => setBulkCancelOpen(true)}
            >
              {t('appointments.bulk.cancel')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('appointments.bulk.clear')}
            </Button>
          </div>
        ) : null}

        {isError && !data ? (
          <div className="p-4">
            <ErrorState
              title={t('appointments.errorTitle')}
              description={t(`errors.${clinicError?.code ?? 'generic'}`, {
                defaultValue: clinicError?.message,
              })}
              action={
                <Button variant="secondary" onClick={() => void refetch()}>
                  {t('clinic.retry')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Table from md up; card list below. */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('appointments.title')}</caption>
                <thead className="border-y border-border bg-bg">
                  <tr>
                    {manage ? (
                      <th scope="col" className="w-10 ps-4">
                        <input
                          ref={headerCheckbox}
                          type="checkbox"
                          aria-label={t('appointments.bulk.selectAll')}
                          checked={allSelected}
                          onChange={() =>
                            setSelected(allSelected ? new Set() : new Set(visibleIds))
                          }
                          className="size-4"
                        />
                      </th>
                    ) : null}
                    {COLUMNS.map((column) => (
                      <SortHeader
                        key={column.field}
                        field={column.field}
                        label={t(column.labelKey)}
                        sort={sort}
                        className={column.className}
                        onSort={(field) => update({ sort: nextSort(filters.sort || sort, field) })}
                      />
                    ))}
                    <th scope="col" className="w-12 px-3">
                      <span className="sr-only">{t('clinic.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody aria-busy={isFetching}>
                  {isLoading ? (
                    Array.from({ length: 6 }, (_, index) => (
                      <tr key={index} className="border-b border-border">
                        <td colSpan={colSpan} className="px-4 py-3">
                          <Skeleton className="h-10" />
                        </td>
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="p-4">
                        <EmptyBlock
                          filtered={filtered}
                          filters={filters}
                          doctorName={doctorName}
                          manage={manage}
                          onReset={() =>
                            setSearchParams(serializeFilters(EMPTY_FILTERS), { replace: true })
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('button,a,input,[role="menu"]'))
                            return;
                          navigate(`/appointments/${item.id}`);
                        }}
                        className="cursor-pointer border-b border-border transition hover:bg-bg"
                      >
                        {manage ? (
                          <td className="ps-4">
                            <input
                              type="checkbox"
                              className="size-4"
                              aria-label={t('appointments.bulk.selectRow', { code: item.code })}
                              checked={selected.has(item.id)}
                              onChange={() => toggleOne(item.id)}
                            />
                          </td>
                        ) : null}
                        <td className="hidden px-3 py-3 text-xs text-muted xl:table-cell">
                          <span dir="ltr">#{item.code}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/appointments/${item.id}`}
                            className="flex items-center gap-3 rounded-md font-semibold text-text hover:text-primary"
                          >
                            <Avatar initials={item.patient.initials} />
                            <span className="truncate">{item.patient.name}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block font-medium text-text">{item.doctor.name}</span>
                          <span className="block text-xs text-muted">{item.doctor.specialty}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block font-medium text-text">
                            {format.date(item.startsAt)}
                          </span>
                          <span className="block text-xs text-muted">
                            <span dir="ltr">{format.time(item.startsAt)}</span> ·{' '}
                            {t('clinic.minutes', { count: item.durationMinutes })}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <TypeLabel type={item.type} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-3 py-3 text-end">
                          <Dropdown
                            label={t('appointments.actions.for', { code: item.code })}
                            trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                            items={menuFor(item)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 p-3 md:hidden" aria-label={t('appointments.title')}>
              {isLoading ? (
                Array.from({ length: 4 }, (_, index) => (
                  <li key={index}>
                    <Skeleton className="h-28" />
                  </li>
                ))
              ) : items.length === 0 ? (
                <li>
                  <EmptyBlock
                    filtered={filtered}
                    filters={filters}
                    doctorName={doctorName}
                    manage={manage}
                    onReset={() =>
                      setSearchParams(serializeFilters(EMPTY_FILTERS), { replace: true })
                    }
                  />
                </li>
              ) : (
                items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start gap-3">
                      {manage ? (
                        <input
                          type="checkbox"
                          className="mt-3 size-4"
                          aria-label={t('appointments.bulk.selectRow', { code: item.code })}
                          checked={selected.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                        />
                      ) : null}
                      <Link
                        to={`/appointments/${item.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <Avatar initials={item.patient.initials} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-text">
                            {item.patient.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {item.doctor.name} · {item.doctor.specialty}
                          </span>
                        </span>
                      </Link>
                      <Dropdown
                        label={t('appointments.actions.for', { code: item.code })}
                        trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                        items={menuFor(item)}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 ps-0 text-xs text-muted">
                      <span>
                        {format.date(item.startsAt)} ·{' '}
                        <span dir="ltr">{format.time(item.startsAt)}</span> ·{' '}
                        {t('clinic.minutes', { count: item.durationMinutes })}
                      </span>
                      <span className="flex items-center gap-2">
                        <TypeLabel type={item.type} />
                        <StatusBadge status={item.status} />
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p aria-live="polite" className="text-xs text-muted">
                {total === 0
                  ? t('appointments.showingNone')
                  : t('appointments.showing', {
                      from: format.number(from),
                      to: format.number(to),
                      total: format.number(total),
                    })}
              </p>
              {pages > 1 ? (
                <nav aria-label={t('appointments.pagination')} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={filters.page <= 1}
                    onClick={() => update({ page: filters.page - 1 })}
                    aria-label={t('appointments.prevPage')}
                    className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg disabled:opacity-40"
                  >
                    <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                  </button>
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      aria-current={page === filters.page ? 'page' : undefined}
                      aria-label={t('appointments.goToPage', { page })}
                      onClick={() => update({ page })}
                      className={`grid size-10 place-items-center rounded-md text-sm ${
                        page === filters.page
                          ? 'bg-primary font-semibold text-white'
                          : 'text-text hover:bg-bg'
                      }`}
                    >
                      {format.number(page)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={filters.page >= pages}
                    onClick={() => update({ page: filters.page + 1 })}
                    aria-label={t('appointments.nextPage')}
                    className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg disabled:opacity-40"
                  >
                    <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                  </button>
                </nav>
              ) : null}
            </div>
          </>
        )}
      </section>

      <CancelDialog
        open={cancelTarget !== null}
        title={t('appointments.cancel.title', { code: cancelTarget?.code ?? '' })}
        description={
          cancelTarget
            ? t('appointments.cancel.body', { patient: cancelTarget.patient.name })
            : undefined
        }
        confirmLabel={t('appointments.cancel.confirm')}
        onClose={() => setCancelTarget(null)}
        onSubmit={(reason) => (cancelTarget ? cancel(cancelTarget.id, reason) : Promise.resolve())}
      />
      <CancelDialog
        open={bulkCancelOpen}
        title={t('appointments.bulk.cancelTitle', { count: bulkCancelIds.length })}
        description={t('appointments.bulk.cancelBody')}
        confirmLabel={t('appointments.bulk.cancelConfirm')}
        onClose={() => setBulkCancelOpen(false)}
        onSubmit={async (reason) => {
          await bulk(bulkCancelIds, 'CANCEL', reason);
          setSelected(new Set());
        }}
      />
      <RescheduleDialog target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
    </div>
  );
}

function EmptyBlock({
  filtered,
  filters,
  doctorName,
  manage,
  onReset,
}: {
  filtered: boolean;
  filters: AppointmentFilters;
  doctorName: string;
  manage: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  if (!filtered) {
    return (
      <EmptyState
        icon={<CalendarX size={18} />}
        title={t('appointments.emptyTitle')}
        description={t('appointments.emptyBody')}
        action={
          manage ? (
            <Button onClick={() => openBooking()}>
              <Plus size={16} aria-hidden="true" />
              {t('appointments.create')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const echo = [
    filters.search ? `“${filters.search}”` : '',
    filters.from || filters.to ? `${filters.from || '…'} → ${filters.to || '…'}` : '',
    doctorName,
    filters.specialty,
    ...filters.status.map((status) => t(`clinic.status.${status}`)),
    ...filters.type.map((type) => t(`clinic.type.${type}`)),
  ].filter(Boolean);

  return (
    <EmptyState
      icon={<CalendarX size={18} />}
      title={t('appointments.noResultsTitle')}
      description={t('appointments.noResultsBody', { filters: echo.join(' · ') })}
      action={
        <Button variant="secondary" onClick={onReset}>
          {t('appointments.resetFilters')}
        </Button>
      }
    />
  );
}
