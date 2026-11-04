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

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full bg-accent text-primary"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-text">
        {value}
        {unit ? <span className="ms-1 text-sm font-normal text-muted">{unit}</span> : null}
      </p>
      {delta ? (
        <p className={`mt-1 flex items-center gap-1 text-sm ${toneClass}`}>
          <span aria-hidden>{rising ? '▲' : delta.value === 0 ? '■' : '▼'}</span>
          <span>
            {rising ? '+' : ''}
            {delta.value}%
          </span>
          <span className="text-muted">{delta.period}</span>
        </p>
      ) : null}
    </div>
  );
}
