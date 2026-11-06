import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  FileDown,
  FileText,
  Minus,
  XCircle,
} from 'lucide-react';
import { type AnalyticsDto, type AnalyticsScope } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { DatePicker } from '../../common/DatePicker';
import { Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useToast } from '../../common/Toast';
import { color } from '../../design-system/tokens';
import { asClinicError } from '../../store/clinicApi';
import { PageHeader } from '../shared/PageHeader';
import { useClinicFormat } from '../shared/format';
import { downloadExport, useAnalyticsQuery } from './api';
import { ChartPanel } from './ChartPanel';
import { InsightsPanel } from './InsightsPanel';
import {
  RANGE_PRESETS,
  changeInfo,
  isValidRange,
  presetRange,
  previousPeriod,
  signed,
  type DateRange,
  type RangePreset,
} from './ranges';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';
import { canUser } from '../../auth/permissions';

const PALETTE = [
  color.primary,
  color.info,
  color.alert,
  color.success,
  color.navy,
  color['border-strong'],
];

function KpiTile({
  label,
  value,
  icon,
  change,
  lowerIsBetter,
  changeText,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  change: number;
  lowerIsBetter?: boolean;
  changeText: string;
}) {
  const info = changeInfo(change, lowerIsBetter);
  const tone = info.good === null ? 'text-muted' : info.good ? 'text-success' : 'text-error';
  const Arrow =
    info.direction === 'up' ? ArrowUpRight : info.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-primary"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
          <p className={`mt-1 flex items-center gap-1 text-xs ${tone}`}>
            <Arrow size={14} aria-hidden="true" className="shrink-0" />
            <span>{changeText}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  changeText,
  change,
}: {
  label: string;
  value: string;
  changeText?: string;
  change?: number;
}) {
  const info = changeInfo(change ?? 0, true);
  const tone = info.good === null ? 'text-muted' : info.good ? 'text-success' : 'text-error';
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
      {changeText && <p className={`mt-1 text-xs ${tone}`}>{changeText}</p>}
    </div>
  );
}

/** ANA-2: range-driven operational analytics with exports. */
export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const fmt = useClinicFormat();
  const toast = useToast();
  const { user } = useAuth();
  const rtl = i18n.dir() === 'rtl';
  const today = fmt.localDate();

  const [preset, setPreset] = useState<RangePreset>('last30');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('last30', today));
  const [scope, setScope] = useState<AnalyticsScope>('clinic');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const range = useMemo(() => presetRange(preset, today, custom), [preset, today, custom]);
  const valid = isValidRange(range);
  const effectiveScope: AnalyticsScope = user?.role === 'SUPER_ADMIN' ? scope : 'clinic';
  const params = { from: range.from, to: range.to, scope: effectiveScope };
  const query = useAnalyticsQuery(params, { skip: !valid, refetchOnMountOrArgChange: true });
  const data: AnalyticsDto | undefined = query.data;
  const canExport = canUser(user, 'manageSettings');

  const num = (v: number, max = 1) => fmt.number(v, { maximumFractionDigits: max });
  const pct = (v: number) => `${num(v)}%`;
  const dayLabel = (d: string) => fmt.shortDate(`${d}T12:00:00Z`);
  const previous = data?.previous ?? previousPeriod(range);

  const doExport = async (kind: 'csv' | 'pdf') => {
    setExporting(kind);
    try {
      await downloadExport(kind, params);
      toast.success(t('analytics.exported'));
    } catch (error) {
      const e = asClinicError(error) as { code?: string; message?: string } | null;
      toast.error(t('analytics.exportError', { defaultValue: e?.message ?? '' }));
    } finally {
      setExporting(null);
    }
  };

  const axisProps = {
    tickLine: false,
    axisLine: false,
    fontSize: 12,
    stroke: color.muted,
  } as const;
  const tooltipStyle = {
    contentStyle: { borderRadius: 12, border: `1px solid ${color.border}`, fontSize: 12 },
  };

  const summary = (title: string, rows: [string, number][]) => {
    if (rows.length === 0) return t('analytics.noData');
    const top = rows.reduce((a, b) => (b[1] > a[1] ? b : a));
    return t('analytics.summary', { title, count: rows.length, label: top[0], value: num(top[1]) });
  };

  let content: ReactNode = null;
  if (!valid) {
    content = (
      <p
        role="alert"
        className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error"
      >
        {t('analytics.invalidRange')}
      </p>
    );
  } else if (query.isLoading) {
    content = (
      <div aria-busy="true" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  } else if (query.isError && !data) {
    content = (
      <ErrorState
        title={t('analytics.loadError')}
        description={asClinicError(query.error)?.message}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('clinic.retry')}
          </Button>
        }
      />
    );
  } else if (data) {
    const k = data.kpis;
    const empty = k.volume === 0 && data.volumeByDay.every((d) => d.count === 0);
    if (empty) {
      content = (
        <EmptyState
          title={t('analytics.empty.title')}
          description={t('analytics.empty.body', {
            from: dayLabel(data.range.from),
            to: dayLabel(data.range.to),
          })}
          action={
            preset !== 'last90' ? (
              <Button variant="secondary" onClick={() => setPreset('last90')}>
                {t('analytics.empty.action')}
              </Button>
            ) : undefined
          }
        />
      );
    } else {
      const volumeRows = data.volumeByDay.map((d): [string, number] => [dayLabel(d.date), d.count]);
      const waitRows = data.waitByDay.map((d): [string, number] => [dayLabel(d.date), d.minutes]);
      const specialtyTotal = data.bySpecialty.reduce((s, x) => s + x.count, 0);
      const statusRows = data.statusDistribution.map((s): [string, number] => [
        t(`clinic.status.${s.status}`),
        s.count,
      ]);
      const hourRows = data.peakHours.map((h): [string, number] => [
        `${String(h.hour).padStart(2, '0')}:00`,
        h.count,
      ]);
      const utilRows = data.doctorUtilisation.map((d): [string, number] => [d.name, d.utilisation]);
      const mapRows = (rows: [string, number][], suffix = ''): [string, string][] =>
        rows.map(([a, b]) => [a, `${num(b)}${suffix}`]);

      content = (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label={t('analytics.kpi.volume')}
              value={fmt.number(k.volume)}
              icon={<CalendarDays size={20} />}
              change={k.volumeChangePct}
              changeText={t('analytics.change.percent', {
                value: signed(k.volumeChangePct, num(k.volumeChangePct)),
              })}
            />
            <KpiTile
              label={t('analytics.kpi.noShow')}
              value={pct(k.noShowRate)}
              icon={<XCircle size={20} />}
              change={k.noShowRateChange}
              lowerIsBetter
              changeText={t('analytics.change.points', {
                value: signed(k.noShowRateChange, num(k.noShowRateChange)),
              })}
            />
            <KpiTile
              label={t('analytics.kpi.wait')}
              value={t('clinic.minutes', { count: Math.round(k.avgWaitMinutes) })}
              icon={<Clock3 size={20} />}
              change={k.avgWaitChange}
              lowerIsBetter
              changeText={
                k.avgWaitChange === 0
                  ? t('analytics.change.same')
                  : t(k.avgWaitChange < 0 ? 'analytics.change.faster' : 'analytics.change.slower', {
                      value: num(Math.abs(k.avgWaitChange)),
                    })
              }
            />
            <KpiTile
              label={t('analytics.kpi.throughput')}
              value={t('analytics.perDay', { value: num(k.throughputPerDay) })}
              icon={<Activity size={20} />}
              change={k.throughputChangePct}
              changeText={t('analytics.change.percent', {
                value: signed(k.throughputChangePct, num(k.throughputChangePct)),
              })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel
              title={t('analytics.charts.volume')}
              summary={summary(t('analytics.charts.volume'), volumeRows)}
              columns={[t('analytics.date'), t('analytics.appointments')]}
              rows={mapRows(volumeRows)}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeRows.map(([name, value]) => ({ name, value }))}>
                  <CartesianGrid stroke={color.border} vertical={false} />
                  <XAxis dataKey="name" reversed={rtl} minTickGap={16} {...axisProps} />
                  <YAxis
                    orientation={rtl ? 'right' : 'left'}
                    allowDecimals={false}
                    width={32}
                    {...axisProps}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [fmt.number(Number(v)), t('analytics.appointments')]}
                  />
                  <Bar dataKey="value" fill={color.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title={t('analytics.charts.wait')}
              badge={
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                  {t('clinic.minutes', { count: Math.round(k.avgWaitMinutes) })}
                </span>
              }
              summary={summary(t('analytics.charts.wait'), waitRows)}
              columns={[t('analytics.date'), t('analytics.minutes')]}
              rows={mapRows(waitRows)}
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={waitRows.map(([name, value]) => ({ name, value }))}>
                  <CartesianGrid stroke={color.border} vertical={false} />
                  <XAxis dataKey="name" reversed={rtl} minTickGap={16} {...axisProps} />
                  <YAxis orientation={rtl ? 'right' : 'left'} width={32} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [
                      t('clinic.minutes', { count: Number(v) }),
                      t('analytics.minutes'),
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color.primary}
                    fill={color.accent}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title={t('analytics.charts.specialty')}
              summary={summary(
                t('analytics.charts.specialty'),
                data.bySpecialty.map((s): [string, number] => [
                  specialtyLabel(s.specialty),
                  s.count,
                ]),
              )}
              columns={[t('analytics.specialty'), t('analytics.appointments')]}
              rows={mapRows(
                data.bySpecialty.map((s): [string, number] => [
                  specialtyLabel(s.specialty),
                  s.count,
                ]),
              )}
            >
              <div className="flex flex-wrap items-center justify-center gap-6">
                <div className="relative size-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.bySpecialty.map((s) => ({
                          ...s,
                          specialty: specialtyLabel(s.specialty),
                        }))}
                        dataKey="count"
                        nameKey="specialty"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {data.bySpecialty.map((s, i) => (
                          <Cell key={s.specialty} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-2xl font-semibold text-text">
                        {fmt.number(specialtyTotal)}
                      </p>
                      <p className="text-xs text-muted">{t('analytics.total')}</p>
                    </div>
                  </div>
                </div>
                <ul className="min-w-40 space-y-2 text-sm">
                  {data.bySpecialty.map((s, i) => (
                    <li key={s.specialty} className="flex items-center justify-between gap-6">
                      <span className="flex items-center gap-2 text-muted">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ background: PALETTE[i % PALETTE.length] }}
                        />
                        {specialtyLabel(s.specialty)}
                      </span>
                      <span className="font-semibold text-text">{fmt.number(s.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartPanel>

            <ChartPanel
              title={t('analytics.charts.status')}
              summary={summary(t('analytics.charts.status'), statusRows)}
              columns={[t('analytics.status'), t('analytics.appointments')]}
              rows={mapRows(statusRows)}
            >
              <ResponsiveContainer width="100%" height={Math.max(160, statusRows.length * 36)}>
                <BarChart
                  layout="vertical"
                  data={statusRows.map(([name, value]) => ({ name, value }))}
                  margin={{ left: 8 }}
                >
                  <CartesianGrid stroke={color.border} horizontal={false} />
                  <XAxis type="number" reversed={rtl} allowDecimals={false} {...axisProps} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    orientation={rtl ? 'right' : 'left'}
                    width={96}
                    // In an RTL document SVG text anchors flip, so `start` would draw the label
                    // over the bars; `end` keeps it in the reserved axis column.
                    tick={rtl ? { textAnchor: 'end' } : undefined}
                    {...axisProps}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [fmt.number(Number(v)), t('analytics.appointments')]}
                  />
                  <Bar dataKey="value" fill={color.info} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title={t('analytics.charts.utilisation')}
              summary={summary(t('analytics.charts.utilisation'), utilRows)}
              columns={[t('analytics.doctor'), t('analytics.utilisation')]}
              rows={mapRows(utilRows, '%')}
            >
              <ul className="space-y-3">
                {data.doctorUtilisation.map((d) => (
                  <li key={d.doctorId} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate text-text">{d.name}</span>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(d.utilisation)}
                      aria-label={d.name}
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ inlineSize: `${Math.min(100, d.utilisation)}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-end font-semibold text-text" dir="ltr">
                      {pct(d.utilisation)}
                    </span>
                  </li>
                ))}
              </ul>
            </ChartPanel>

            <ChartPanel
              title={t('analytics.charts.peak')}
              summary={summary(t('analytics.charts.peak'), hourRows)}
              columns={[t('analytics.hour'), t('analytics.appointments')]}
              rows={mapRows(hourRows)}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourRows.map(([name, value]) => ({ name, value }))}>
                  <CartesianGrid stroke={color.border} vertical={false} />
                  <XAxis dataKey="name" reversed={rtl} minTickGap={8} {...axisProps} />
                  <YAxis
                    orientation={rtl ? 'right' : 'left'}
                    allowDecimals={false}
                    width={32}
                    {...axisProps}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [fmt.number(Number(v)), t('analytics.appointments')]}
                  />
                  <Bar dataKey="value" fill={color.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label={t('analytics.kpi.cancellation')}
              value={pct(k.cancellationRate)}
              change={k.cancellationRateChange}
              changeText={t('analytics.change.points', {
                value: signed(k.cancellationRateChange, num(k.cancellationRateChange)),
              })}
            />
            <StatTile
              label={t('analytics.kpi.duration')}
              value={t('clinic.minutes', { count: Math.round(k.avgDurationMinutes) })}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('analytics.eyebrow')}
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        actions={
          canExport ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void doExport('csv')}
                disabled={!valid || exporting !== null}
              >
                <FileDown size={16} aria-hidden="true" />
                {t('analytics.exportCsv')}
              </Button>
              <Button onClick={() => void doExport('pdf')} disabled={!valid || exporting !== null}>
                <FileText size={16} aria-hidden="true" />
                {t('analytics.exportPdf')}
              </Button>
            </>
          ) : undefined
        }
      />

      <section
        aria-label={t('analytics.filters')}
        className="mb-4 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-surface p-4 shadow-(--shadow-card)"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <label htmlFor="an-range" className="mb-1.5 block text-xs text-muted">
              {t('analytics.range')}
            </label>
            <Select
              id="an-range"
              value={preset}
              onChange={(e) => setPreset(e.target.value as RangePreset)}
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`analytics.presets.${p}`)}
                </option>
              ))}
            </Select>
          </div>
          {preset === 'custom' && (
            <>
              <div className="w-44">
                <DatePicker
                  label={t('analytics.from')}
                  value={custom.from}
                  max={custom.to}
                  onChange={(v) => setCustom((c) => ({ ...c, from: v }))}
                  locale={fmt.locale}
                />
              </div>
              <div className="w-44">
                <DatePicker
                  label={t('analytics.to')}
                  value={custom.to}
                  min={custom.from}
                  onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
                  locale={fmt.locale}
                />
              </div>
            </>
          )}
          {user?.role === 'SUPER_ADMIN' && (
            <div className="w-44">
              <label htmlFor="an-scope" className="mb-1.5 block text-xs text-muted">
                {t('analytics.scope')}
              </label>
              <Select
                id="an-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as AnalyticsScope)}
              >
                <option value="clinic">{t('analytics.scopes.clinic')}</option>
                <option value="organization">{t('analytics.scopes.organization')}</option>
              </Select>
            </div>
          )}
          <p className="pb-2 text-xs text-muted">
            {t('analytics.compared')} ({dayLabel(previous.from)} – {dayLabel(previous.to)})
          </p>
        </div>
        {query.fulfilledTimeStamp && (
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {t('analytics.updated', { time: fmt.time(query.fulfilledTimeStamp) })}
          </span>
        )}
      </section>

      {content}

      {valid && (
        <InsightsPanel
          from={range.from}
          to={range.to}
          organizationScope={effectiveScope === 'organization'}
        />
      )}
    </div>
  );
}
