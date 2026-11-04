import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from './Badge';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Enables the sort control on this column. */
  sortable?: boolean;
  /** Value the sort compares; defaults to the raw cell value. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Hide from the mobile card list to keep it short. */
  hideOnCard?: boolean;
}

type Direction = 'asc' | 'desc';

function defaultCompare(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function cellText<T extends { id: string }>(column: Column<T>, row: T): string {
  const raw = row[column.key as keyof T];
  return raw == null ? '' : String(raw);
}

/**
 * Table that becomes a card list below the `md` breakpoint (FR-008, AC-010).
 *
 * Sorting is exposed through `aria-sort` on the header cell, which is how a
 * screen reader conveys current order — the header button carries only the
 * action, never the state. The card list is rendered from the same columns, so
 * mobile and desktop cannot show different data.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  caption,
  sortable = true,
  emptyLabel = 'No records',
}: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
  sortable?: boolean;
  emptyLabel?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: Direction } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => String(c.key) === sort.key);
    if (!column) return rows;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const read = (row: T) =>
        column.sortValue ? column.sortValue(row) : row[column.key as keyof T];
      return direction * defaultCompare(read(a) as string | number, read(b) as string | number);
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const ariaSort = (column: Column<T>) => {
    if (!sortable || !column.sortable) return undefined;
    if (sort?.key !== String(column.key)) return 'none' as const;
    return sort.direction === 'asc' ? ('ascending' as const) : ('descending' as const);
  };

  const renderCell = (column: Column<T>, row: T) =>
    column.render ? column.render(row) : cellText(column, row);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full min-w-[720px] text-start text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-bg text-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  aria-sort={ariaSort(col)}
                  className="px-4 py-3 font-medium"
                >
                  {sortable && col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-1 text-current"
                      onClick={() => toggleSort(String(col.key))}
                    >
                      {col.header}
                      <span aria-hidden className="text-xs">
                        {sort?.key === String(col.key)
                          ? sort.direction === 'asc'
                            ? '▲'
                            : '▼'
                          : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-4 text-text">
                      {renderCell(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {sorted.length === 0 ? (
          <li className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            {emptyLabel}
          </li>
        ) : (
          sorted.map((row) => (
            <li key={row.id} className="rounded-lg border border-border bg-surface p-4">
              <dl className="space-y-2">
                {columns
                  .filter((col) => !col.hideOnCard)
                  .map((col) => (
                    <div
                      key={String(col.key)}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="text-xs text-muted">{col.header}</dt>
                      <dd className="text-end text-sm text-text">{renderCell(col, row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

export function StatusCell({ status }: { status: string }) {
  const tone = /Confirmed|Checked in/.test(status)
    ? 'success'
    : /In progress/.test(status)
      ? 'info'
      : /Cancelled/.test(status)
        ? 'error'
        : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
