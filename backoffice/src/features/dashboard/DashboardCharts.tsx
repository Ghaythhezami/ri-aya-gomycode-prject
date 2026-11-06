import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppointmentStatus, DashboardDto } from '@riaya/shared';
import { color } from '../../design-system/tokens';
import { formatYmd } from '../calendar/dates';
import { useClinicFormat } from '../shared/format';

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  SCHEDULED: color['border-strong'],
  CONFIRMED: color.success,
  CHECKED_IN: color.primary,
  IN_PROGRESS: color.info,
  COMPLETED: color.navy,
  CANCELLED: color.error,
  NO_SHOW: color.warning,
};

function ChartCard({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col rounded-lg border border-border bg-surface shadow-(--shadow-card)">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {aside}
      </figcaption>
      <div className="flex-1 p-4">{children}</div>
    </figure>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${color.border}`,
  fontSize: 12,
};

export function DashboardCharts({ data }: { data: DashboardDto }) {
  const { t } = useTranslation();
  const format = useClinicFormat();
  const day = (ymd: string) => formatYmd(ymd, format.locale, { weekday: 'short' });

  const weekly = data.weeklyVolume.map((point) => ({ label: day(point.date), count: point.count }));
  const wait = data.waitTrend.map((point) => ({ label: day(point.date), minutes: point.minutes }));
  const statuses = data.statusDistribution.filter((entry) => entry.count > 0);
  const total = statuses.reduce((sum, entry) => sum + entry.count, 0);
  const lastWait = data.waitTrend[data.waitTrend.length - 1]?.minutes;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ChartCard
        title={t('dashboard.charts.weekly')}
        aside={<span className="text-xs text-muted">{t('dashboard.charts.thisWeek')}</span>}
      >
        {weekly.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t('dashboard.charts.empty')}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weekly} accessibilityLayer>
                <CartesianGrid stroke={color.border} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: color.accent }}
                  formatter={(value) => [value, t('dashboard.charts.appointments')]}
                />
                <Bar dataKey="count" fill={color.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="sr-only">
              {weekly.map((point) => `${point.label}: ${point.count}`).join(', ')}
            </p>
          </>
        )}
      </ChartCard>

      <ChartCard title={t('dashboard.charts.status')}>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t('dashboard.charts.empty')}</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={statuses}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={44}
                    outerRadius={66}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statuses.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [value, t(`clinic.status.${String(name)}`)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-xl font-semibold text-text">{format.number(total)}</p>
                  <p className="text-xs text-muted">{t('dashboard.charts.total')}</p>
                </div>
              </div>
            </div>
            <ul className="w-full space-y-1.5 text-sm">
              {statuses.map((entry) => (
                <li key={entry.status} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[entry.status] }}
                  />
                  <span className="flex-1 truncate text-muted">
                    {t(`clinic.status.${entry.status}`)}
                  </span>
                  <span className="font-medium text-text">{format.number(entry.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t('dashboard.charts.utilisation')}>
        {data.doctorUtilisation.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t('dashboard.charts.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {data.doctorUtilisation.map((doctor) => (
              <li key={doctor.doctorId}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-text">{doctor.name}</span>
                  <span className="font-medium text-text">{Math.round(doctor.utilisation)}%</span>
                </div>
                <div
                  role="meter"
                  aria-label={doctor.name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(doctor.utilisation)}
                  className="h-2 overflow-hidden rounded-full bg-bg"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, doctor.utilisation))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard
        title={t('dashboard.charts.waitTrend')}
        aside={
          lastWait === undefined ? null : (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
              {t('clinic.minutes', { count: Math.round(lastWait) })}
            </span>
          )
        }
      >
        {wait.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t('dashboard.charts.empty')}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={wait} accessibilityLayer>
                <CartesianGrid stroke={color.border} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    t('clinic.minutes', { count: Math.round(Number(value)) }),
                    t('dashboard.charts.waitTrend'),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  stroke={color.primary}
                  strokeWidth={2}
                  dot={{ r: 3, fill: color.primary }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="sr-only">
              {wait.map((point) => `${point.label}: ${Math.round(point.minutes)}`).join(', ')}
            </p>
          </>
        )}
      </ChartCard>
    </div>
  );
}
