import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  effectiveSort,
  hasActiveFilters,
  nextSort,
  parseFilters,
  serializeFilters,
  toQuery,
} from './filters';
import { allowedActions } from './actions';

const TODAY = '2025-04-22';

describe('appointment filters in the URL', () => {
  it('parses every filter from a query string', () => {
    const filters = parseFilters(
      new URLSearchParams(
        'search=sarah&from=2025-04-21&to=2025-04-27&doctorId=d1&specialty=Cardiology&status=CONFIRMED,CHECKED_IN&type=FOLLOW_UP&page=3&sort=-startsAt',
      ),
      TODAY,
    );
    expect(filters).toEqual({
      search: 'sarah',
      from: '2025-04-21',
      to: '2025-04-27',
      doctorId: 'd1',
      specialty: 'Cardiology',
      status: ['CONFIRMED', 'CHECKED_IN'],
      type: ['FOLLOW_UP'],
      page: 3,
      sort: '-startsAt',
    });
  });

  it('serialises back to the same filters (round trip)', () => {
    const original = parseFilters(
      new URLSearchParams('from=2025-04-21&to=2025-04-27&status=CANCELLED&page=2&sort=code'),
      TODAY,
    );
    const again = parseFilters(serializeFilters(original), TODAY);
    expect(again).toEqual(original);
  });

  it('resolves the dashboard "today" shortcut and omits defaults', () => {
    const filters = parseFilters(new URLSearchParams('from=today&to=today'), TODAY);
    expect(filters.from).toBe(TODAY);
    expect(filters.to).toBe(TODAY);
    // "All dates" is explicit; an empty URL means the default range.
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('dates=all');
    expect(parseFilters(new URLSearchParams(''), TODAY).from).toBe(TODAY);
    expect(parseFilters(new URLSearchParams('dates=all'), TODAY).from).toBe('');
    expect(serializeFilters({ ...filters, page: 1 }).toString()).toBe(`from=${TODAY}&to=${TODAY}`);
  });

  it('drops junk values instead of sending them to the API', () => {
    const filters = parseFilters(
      new URLSearchParams('from=banana&status=NOPE,CONFIRMED&type=X&page=-4&sort=password'),
      TODAY,
    );
    // The junk date is dropped, so the default range (today to +7 days) applies.
    expect(filters.from).toBe(TODAY);
    expect(filters.status).toEqual(['CONFIRMED']);
    expect(filters.type).toEqual([]);
    expect(filters.page).toBe(1);
    expect(filters.sort).toBe('');
  });

  it('builds the API query with comma lists, page size and a sensible default sort', () => {
    const dated = parseFilters(
      new URLSearchParams('from=today&status=CONFIRMED,CHECKED_IN'),
      TODAY,
    );
    expect(toQuery(dated)).toMatchObject({
      from: TODAY,
      status: 'CONFIRMED,CHECKED_IN',
      page: 1,
      limit: 10,
      sort: 'startsAt',
    });
    expect(effectiveSort(EMPTY_FILTERS)).toBe('-startsAt');
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(dated)).toBe(true);
  });

  it('cycles the sort asc, desc, default', () => {
    expect(nextSort('', 'code')).toBe('code');
    expect(nextSort('code', 'code')).toBe('-code');
    expect(nextSort('-code', 'code')).toBe('');
  });
});

describe('allowed row actions', () => {
  it('offers only legal transitions and cancel/reschedule to front desk', () => {
    const kinds = allowedActions('RECEPTIONIST', 'SCHEDULED').map((a) =>
      a.kind === 'status' ? a.to : a.kind,
    );
    expect(kinds).toEqual(['CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'reschedule', 'cancel']);
  });

  it('offers nothing on a completed appointment', () => {
    expect(allowedActions('CLINIC_ADMIN', 'COMPLETED')).toEqual([]);
  });

  it('lets a doctor change status but not cancel or reschedule', () => {
    const kinds = allowedActions('DOCTOR', 'CHECKED_IN').map((a) =>
      a.kind === 'status' ? a.to : a.kind,
    );
    expect(kinds).toEqual(['IN_PROGRESS', 'NO_SHOW']);
  });
});
