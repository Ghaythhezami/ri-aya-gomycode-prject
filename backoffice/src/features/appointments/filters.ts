import { APPOINTMENT_STATUSES } from '@riaya/shared';
import type { AppointmentStatus, AppointmentType } from '@riaya/shared';
import { addDays, isYmd, startOfWeek } from '../calendar/dates';

/**
 * Appointment list filters, page and sort. They live in the URL query string, so a
 * filtered list can be shared and survives a reload (APP-4).
 */
export interface AppointmentFilters {
  search: string;
  /** Local clinic date `YYYY-MM-DD` or ''. */
  from: string;
  to: string;
  doctorId: string;
  specialty: string;
  status: AppointmentStatus[];
  type: AppointmentType[];
  page: number;
  /** Explicit sort (`field` or `-field`); '' means the default for the current filters. */
  sort: string;
}

export const PAGE_SIZE = 10;

/** The list opens on today through today + 7 days. */
export const DEFAULT_RANGE_DAYS = 7;

/** True when the dates are the untouched default range (not a user-chosen filter). */
export function isDefaultRange(filters: AppointmentFilters, today: string): boolean {
  return filters.from === today && filters.to === addDays(today, DEFAULT_RANGE_DAYS);
}

export const SORT_FIELDS = ['code', 'patient', 'doctor', 'startsAt', 'type', 'status'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const EMPTY_FILTERS: AppointmentFilters = {
  search: '',
  from: '',
  to: '',
  doctorId: '',
  specialty: '',
  status: [],
  type: [],
  page: 1,
  sort: '',
};

function pickList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(',').map((value) => value.trim()));
  return allowed.filter((value) => wanted.has(value));
}

/** Shape of an appointment type code (system or clinic-defined); the API validates existence. */
const TYPE_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

function pickCodes(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((value) => value.trim()))].filter((value) =>
    TYPE_CODE.test(value),
  );
}

/** `today`, `week` and ISO dates are accepted for `from`/`to`; anything else is dropped. */
function resolveDate(raw: string | null, today: string, edge: 'from' | 'to'): string {
  if (!raw) return '';
  if (raw === 'today') return today;
  if (raw === 'week') return edge === 'from' ? startOfWeek(today) : addDays(startOfWeek(today), 6);
  return isYmd(raw) ? raw : '';
}

export function parseFilters(params: URLSearchParams, today: string): AppointmentFilters {
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  const sortRaw = params.get('sort') ?? '';
  const sortField = sortRaw.replace(/^-/, '');
  let from = resolveDate(params.get('from'), today, 'from');
  let to = resolveDate(params.get('to'), today, 'to');
  // Empty URL = default range (today to +7 days). `dates=all` is the explicit "All dates".
  if (!from && !to && params.get('dates') !== 'all') {
    from = today;
    to = addDays(today, DEFAULT_RANGE_DAYS);
  }
  return {
    search: (params.get('search') ?? '').slice(0, 100),
    from,
    to,
    doctorId: params.get('doctorId') ?? '',
    specialty: params.get('specialty') ?? '',
    status: pickList(params.get('status'), APPOINTMENT_STATUSES),
    type: pickCodes(params.get('type')),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    sort: (SORT_FIELDS as readonly string[]).includes(sortField) ? sortRaw : '',
  };
}

/** Only non-default values are written, so URLs stay short and stable. */
export function serializeFilters(filters: AppointmentFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (!filters.from && !filters.to) params.set('dates', 'all');
  if (filters.doctorId) params.set('doctorId', filters.doctorId);
  if (filters.specialty) params.set('specialty', filters.specialty);
  if (filters.status.length) params.set('status', filters.status.join(','));
  if (filters.type.length) params.set('type', filters.type.join(','));
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.sort) params.set('sort', filters.sort);
  return params;
}

/** A dated list reads top-down by time; the open-ended list shows the latest first. */
export function effectiveSort(filters: AppointmentFilters): string {
  if (filters.sort) return filters.sort;
  return filters.from || filters.to ? 'startsAt' : '-startsAt';
}

export function toQuery(filters: AppointmentFilters) {
  return {
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    doctorId: filters.doctorId || undefined,
    specialty: filters.specialty || undefined,
    status: filters.status.length ? filters.status.join(',') : undefined,
    type: filters.type.length ? filters.type.join(',') : undefined,
    page: filters.page,
    limit: PAGE_SIZE,
    sort: effectiveSort(filters),
  };
}

/** Number of filters in the "More filters" popover (status, type, specialty). */
export function moreFiltersCount(filters: AppointmentFilters): number {
  return filters.status.length + filters.type.length + (filters.specialty ? 1 : 0);
}

export function hasActiveFilters(filters: AppointmentFilters): boolean {
  return Boolean(
    filters.search ||
    filters.from ||
    filters.to ||
    filters.doctorId ||
    filters.specialty ||
    filters.status.length ||
    filters.type.length,
  );
}

/** Next sort for a header click: ascending, then descending, then back to the default. */
export function nextSort(current: string, field: SortField): string {
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return '';
  return field;
}
