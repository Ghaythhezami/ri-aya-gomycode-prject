import type { ReactNode } from 'react';
import { Badge } from './Badge';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-border bg-white">
      <table className="w-full min-w-[720px] text-start text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-bg text-muted">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-3 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-4 text-text">
                  {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusCell({ status }: { status: string }) {
  const tone =
    status === 'Confirmed' || status === 'Checked in'
      ? 'success'
      : status === 'In progress'
        ? 'info'
        : status === 'Cancelled'
          ? 'error'
          : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
