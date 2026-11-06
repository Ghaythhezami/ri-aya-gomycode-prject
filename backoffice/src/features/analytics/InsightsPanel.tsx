import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Clock3, TrendingUp, UserMinus } from 'lucide-react';
import type { InsightRate, SchedulingInsights } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { color } from '../../design-system/tokens';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { useInsightsQuery } from './api';
import { ChartPanel } from './ChartPanel';
import {
  INTENSITY_STEPS,
  demandCells,
  describeRecommendation,
  hourLabel,
  intensityStep,
  matrixMax,
  ratePercent,
  sortLeadTime,
  sortWeekdays,
  trimHourSpan,
} from './insights';

const STEP_CLASS = [
  'bg-bg text-muted',
  'bg-primary/15 text-text',
  'bg-primary/35 text-text',
  'bg-primary/60 text-text',
  'bg-primary/80 text-white',
  'bg-primary text-white',
] as const;

const axisProps = { tickLine: false, axisLine: false, fontSize: 12, stroke: color.muted } as const;
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: `1px solid ${color.border}`, fontSize: 12 },
};

const REC_ICON = {
  highNoShow: AlertTriangle,
  peak: TrendingUp,
  underused: UserMinus,
  underusedUnnamed: UserMinus,
} as const;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

/** Smart scheduling insights computed by the scheduler service over the full history. */
export function InsightsPanel({
  from,
  to,
  organizationScope = false,
}: {
  from: string;
  to: string;
  organizationScope?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useClinicFormat();
  const rtl = i18n.dir() === 'rtl';
  const query = useInsightsQuery({ from, to }, { refetchOnMountOrArgChange: true });
  const data: SchedulingInsights | undefined = query.data;

  const tag = fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale;
  const weekdayName = useMemo(() => {
    const long = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' });
    const short = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-01 was a Monday, so weekday 0 = Monday.
    const at = (d: number) => new Date(Date.UTC(2024, 0, 1 + d));
    return {
      long: (d: number) => long.format(at(d)),
      short: (d: number) => short.format(at(d)),
    };
  }, [tag]);
  const list = (items: string[]) =>
    typeof Intl.ListFormat === 'function'
      ? new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(items)
      : items.join(', ');

  const num = (v: number, max = 1) => fmt.number(v, { maximumFractionDigits: max });
  const pct = (percent: number) => `${num(percent)}%`;
  const dayLabel = (d: string) => fmt.shortDate(`${d}T12:00:00Z`);
  const visits = (count: number) => t('analytics.insights.visits', { count: fmt.number(count) });

  const header = (
    <header className="mb-4">
      <h2 className="text-lg font-semibold text-text">{t('analytics.insights.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('analytics.insights.description')}</p>
      {organizationScope && (
        <p className="mt-2 rounded-md bg-accent px-3 py-2 text-sm text-text">
          {t('analytics.insights.perClinicNote')}
        </p>
      )}
      {data && (
        <p className="mt-2 text-xs text-muted">
          {t('analytics.insights.provenance', {
            rows: fmt.number(data.meta.rowsScanned),
            ms: fmt.number(Math.round(data.meta.durationMs)),
          })}
        </p>
      )}
    </header>
  );

  let body;
  if (query.isLoading) {
    body = (
      <div aria-busy="true" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  } else if (query.isError && !data) {
    const err = asClinicError(query.error);
    const unavailable = err?.code === 'SERVICE_UNAVAILABLE' || err?.status === 503;
    body = (
      <ErrorState
        title={
          unavailable ? t('analytics.insights.unavailable') : t('analytics.insights.loadError')
        }
        description={
          unavailable ? t('analytics.insights.unavailableBody') : (err?.message ?? undefined)
        }
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('clinic.retry')}
          </Button>
        }
      />
    );
  } else if (data && data.totals.appointments === 0) {
    body = (
      <EmptyState
        title={t('analytics.insights.empty.title')}
        description={t('analytics.insights.empty.body')}
      />
    );
  } else if (data) {
    const { totals } = data;
    const matrix = data.demand.matrix;
    const span = trimHourSpan(matrix);
    const max = matrixMax(matrix);
    const hours = span
      ? Array.from({ length: span.end - span.start + 1 }, (_, i) => span.start + i)
      : [];
    const cellLabel = (weekday: number, hour: number, count: number) =>
      t('analytics.insights.heatmap.cell', {
        weekday: weekdayName.long(weekday),
        time: hourLabel(hour),
        count: fmt.number(count),
      });
    const cells = demandCells(matrix);
    const demandRows = cells.map((c): [string, string] => [
      `${weekdayName.long(c.weekday)} ${hourLabel(c.hour)}`,
      fmt.number(c.count),
    ]);
    const top = cells[0];

    const rateRows = (rows: InsightRate[], label: (key: string) => string) =>
      rows.map((r) => ({
        name: label(r.key),
        value: ratePercent(r.rate),
        count: r.count,
      }));
    const leadData = rateRows(sortLeadTime(data.noShow.byLeadTime), (k) =>
      t(`analytics.insights.lead.${k}`, { defaultValue: k }),
    );
    const weekdayData = rateRows(sortWeekdays(data.noShow.byWeekday), (k) =>
      weekdayName.short(Number(k)),
    );
    const rateSummary = (title: string, rows: typeof leadData) => {
      if (rows.length === 0) return t('analytics.noData');
      const worst = rows.reduce((a, b) => (b.value > a.value ? b : a));
      return t('analytics.insights.noShowSummary', {
        title,
        label: worst.name,
        value: pct(worst.value),
      });
    };
    const rateTable = (rows: typeof leadData): [string, string][] =>
      rows.map((r) => [r.name, `${pct(r.value)} (${visits(r.count)})`]);
    // Horizontal bars: category labels sit beside the bars, so long Arabic or French
    // labels never collide at 375 px the way rotated or crowded x-axis ticks do.
    const rateChart = (rows: typeof leadData) => (
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 36)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={color.border} horizontal={false} />
          <XAxis type="number" reversed={rtl} unit="%" allowDecimals={false} {...axisProps} />
          <YAxis
            type="category"
            dataKey="name"
            orientation={rtl ? 'right' : 'left'}
            width={96}
            // In an RTL document SVG text anchors flip, so `start` would draw the label
            // over the bars; `end` keeps it in the reserved axis column.
            tick={rtl ? { textAnchor: 'end' } : undefined}
            interval={0}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(v, _n, item) => [
              `${pct(Number(v))} (${visits((item.payload as { count: number }).count)})`,
              t('analytics.insights.noShowRate'),
            ]}
          />
          <Bar
            dataKey="value"
            fill={color.alert}
            barSize={18}
            radius={rtl ? [6, 0, 0, 6] : [0, 6, 6, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );

    const forecastData = data.forecast.map((d) => ({
      name: dayLabel(d.date),
      value: Math.round(d.expected * 10) / 10,
    }));
    const forecastTop = forecastData.length
      ? forecastData.reduce((a, b) => (b.value > a.value ? b : a))
      : null;

    const fmtRec = {
      weekday: weekdayName.long,
      number: (v: number) => fmt.number(v),
      list,
    };

    body = (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label={t('analytics.insights.kpi.noShowRate')}
            value={pct(ratePercent(totals.noShowRate))}
          />
          <Tile
            label={t('analytics.insights.kpi.appointments')}
            value={fmt.number(totals.appointments)}
          />
          <Tile
            label={t('analytics.insights.kpi.completed')}
            value={fmt.number(totals.completed)}
          />
          <Tile label={t('analytics.insights.kpi.noShows')} value={fmt.number(totals.noShows)} />
        </div>

        <ChartPanel
          title={t('analytics.insights.heatmap.title')}
          summary={
            top
              ? t('analytics.insights.heatmap.summary', {
                  label: `${weekdayName.long(top.weekday)} ${hourLabel(top.hour)}`,
                  count: fmt.number(top.count),
                })
              : t('analytics.noData')
          }
          columns={[t('analytics.insights.heatmap.slot'), t('analytics.insights.heatmap.bookings')]}
          rows={demandRows}
        >
          <div
            role="region"
            tabIndex={0}
            aria-label={t('analytics.insights.heatmap.region')}
            className="overflow-x-auto rounded-md"
          >
            <div
              role="grid"
              aria-label={t('analytics.insights.heatmap.title')}
              style={{ minInlineSize: `${5 + hours.length * 2.25}rem` }}
              className="space-y-1"
            >
              <div
                role="row"
                className="grid gap-1 text-center text-xs text-muted"
                style={{ gridTemplateColumns: `4.5rem repeat(${hours.length}, minmax(2rem, 1fr))` }}
              >
                <span role="columnheader" className="text-start">
                  <span className="sr-only">{t('analytics.hour')}</span>
                </span>
                {hours.map((h) => (
                  <span key={h} role="columnheader" dir="ltr">
                    {String(h).padStart(2, '0')}
                  </span>
                ))}
              </div>
              {matrix.map((row, weekday) => (
                <div
                  key={weekday}
                  role="row"
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `4.5rem repeat(${hours.length}, minmax(2rem, 1fr))`,
                  }}
                >
                  <span role="rowheader" className="self-center text-start text-xs text-muted">
                    {weekdayName.short(weekday)}
                  </span>
                  {hours.map((h) => {
                    const count = row[h] ?? 0;
                    const step = intensityStep(count, max);
                    return (
                      <span
                        key={h}
                        role="gridcell"
                        aria-label={cellLabel(weekday, h, count)}
                        data-step={step}
                        className={`grid min-h-9 place-items-center rounded-sm border border-border text-xs ${STEP_CLASS[step]}`}
                      >
                        {count > 0 ? fmt.number(count) : ''}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div
            aria-hidden="true"
            className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted"
          >
            <span className="whitespace-nowrap">{t('analytics.insights.heatmap.legendLow')}</span>
            {Array.from({ length: INTENSITY_STEPS + 1 }, (_, s) => (
              <span
                key={s}
                className={`size-5 rounded-sm border border-border ${STEP_CLASS[s]?.split(' ')[0]}`}
              />
            ))}
            <span className="whitespace-nowrap">{t('analytics.insights.heatmap.legendHigh')}</span>
          </div>
        </ChartPanel>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title={t('analytics.insights.charts.leadTime')}
            summary={rateSummary(t('analytics.insights.charts.leadTime'), leadData)}
            columns={[t('analytics.insights.leadTimeColumn'), t('analytics.insights.noShowRate')]}
            rows={rateTable(leadData)}
          >
            {rateChart(leadData)}
          </ChartPanel>
          <ChartPanel
            title={t('analytics.insights.charts.weekday')}
            summary={rateSummary(t('analytics.insights.charts.weekday'), weekdayData)}
            columns={[t('analytics.insights.weekdayColumn'), t('analytics.insights.noShowRate')]}
            rows={rateTable(weekdayData)}
          >
            {rateChart(weekdayData)}
          </ChartPanel>
        </div>

        <ChartPanel
          title={t('analytics.insights.charts.forecast')}
          summary={
            forecastTop
              ? t('analytics.insights.forecastSummary', {
                  count: forecastData.length,
                  label: forecastTop.name,
                  value: num(forecastTop.value),
                })
              : t('analytics.noData')
          }
          columns={[t('analytics.date'), t('analytics.insights.expected')]}
          rows={forecastData.map((d): [string, string] => [d.name, num(d.value)])}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={forecastData}>
              <CartesianGrid stroke={color.border} vertical={false} />
              <XAxis dataKey="name" reversed={rtl} minTickGap={12} {...axisProps} />
              <YAxis
                orientation={rtl ? 'right' : 'left'}
                allowDecimals={false}
                width={32}
                {...axisProps}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => [num(Number(v)), t('analytics.insights.expected')]}
              />
              <Bar dataKey="value" fill={color.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <section
          aria-labelledby="insights-recs"
          className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
        >
          <h3
            id="insights-recs"
            className="border-b border-border px-5 py-3 text-sm font-semibold text-text"
          >
            {t('analytics.insights.recommendations')}
          </h3>
          {data.recommendations.length === 0 ? (
            <p className="flex items-center gap-2 p-5 text-sm text-muted">
              <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
              {t('analytics.insights.noRecommendations')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recommendations.map((rec, i) => {
                const d = describeRecommendation(rec, fmtRec);
                const Icon = REC_ICON[d.key] ?? Clock3;
                return (
                  <li key={`${rec.kind}-${i}`} className="flex items-start gap-3 px-5 py-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary"
                    >
                      <Icon size={16} />
                    </span>
                    <p className="text-sm text-text">
                      {t(`analytics.insights.rec.${d.key}`, d.values)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <section aria-label={t('analytics.insights.title')} className="mt-8">
      {header}
      {body}
    </section>
  );
}
