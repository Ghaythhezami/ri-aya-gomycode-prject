import type { ReactNode } from 'react';

export interface KpiDelta {
  /** Percentage change. Positive renders as a rise, negative as a fall. */
  value: number;
  /** What the change is measured against, e.g. "vs last week". */
  period: string;
  /** Invert the colour meaning, for metrics where lower is better. */
  invert?: boolean;
}

/**
 * Headline metric (FR-007).
 *
 * The optional delta collapses completely when absent (EC-012): no empty
 * placeholder, and the label/value block keeps its alignment so a row of cards
 * stays level whether or not each one has a trend.
 *
 * Direction is carried by an arrow and a leading sign as well as colour, so the
 * good/bad reading survives greyscale and colour-vision deficiency.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: KpiDelta;
  icon?: ReactNode;
}) {
  const improving = delta ? (delta.invert ? delta.value < 0 : delta.value > 0) : false;
  const rising = delta ? delta.value > 0 : false;
  const toneClass = delta
    ? delta.value === 0
      ? 'text-muted'
      : improving
        ? 'text-success'
        : 'text-error'
    : '';

  const deltaBg = delta
    ? delta.value === 0
      ? 'bg-surface-muted'
      : improving
        ? 'bg-success/10'
        : 'bg-error/10'
    : '';

  return (
    <div className="card-lift group relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-(--shadow-soft)">
      <span
        aria-hidden
        className="brand-gradient pointer-events-none absolute inset-x-0 bottom-0 h-1 origin-[0%_50%] scale-x-0 transition-transform duration-300 group-hover:scale-x-100 rtl:origin-[100%_50%]"
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-md bg-accent text-primary transition duration-300 group-hover:bg-primary group-hover:text-white"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="relative mt-3 text-3xl font-bold tracking-tight text-navy tabular-nums">
        {value}
        {unit ? <span className="ms-1 text-sm font-normal text-muted">{unit}</span> : null}
      </p>
      {delta ? (
        <p className="relative mt-2 flex items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass} ${deltaBg}`}
          >
            <span aria-hidden>{rising ? '▲' : delta.value === 0 ? '■' : '▼'}</span>
            <span>
              {rising ? '+' : ''}
              {delta.value}%
            </span>
          </span>
          <span className="text-muted">{delta.period}</span>
        </p>
      ) : null}
    </div>
  );
}
