import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * Card for one chart: a keyboard-focusable wrapper with an accessible summary and a
 * "View as table" toggle that swaps the graphic for the same data as a table.
 */
export function ChartPanel({
  title,
  badge,
  summary,
  columns,
  rows,
  className = '',
  children,
}: {
  title: string;
  badge?: ReactNode;
  /** One-sentence description read by screen readers. */
  summary: string;
  columns: [string, string];
  rows: [string, string][];
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-lg border border-border bg-surface shadow-(--shadow-card) ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 id={headingId} className="text-sm font-semibold text-text">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {badge}
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent"
          >
            {asTable ? (
              <BarChart3 size={14} aria-hidden="true" />
            ) : (
              <Table2 size={14} aria-hidden="true" />
            )}
            {asTable ? t('analytics.viewAsChart') : t('analytics.viewAsTable')}
          </button>
        </div>
      </div>
      <div className="p-5">
        {asTable ? (
          <div className="max-h-72 overflow-auto" tabIndex={0} role="region" aria-label={title}>
            <table className="w-full text-sm">
              <caption className="sr-only">{summary}</caption>
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {columns[0]}
                  </th>
                  <th scope="col" className="py-2 text-end font-medium">
                    {columns[1]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-border last:border-b-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text">
                      {label}
                    </th>
                    <td className="py-2 text-end text-text" dir="ltr">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div role="group" aria-label={`${title}. ${summary}`} tabIndex={0} className="rounded-md">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
