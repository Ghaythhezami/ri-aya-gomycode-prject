import { useTranslations } from 'next-intl';
import { CalendarCheck, Clock, Stethoscope, TrendingUp, UserCheck, Users } from 'lucide-react';
import { BrandMark } from './BrandLogo';

const statusStyles = {
  progress: 'bg-[#e3f0fd] text-blue',
  checked: 'bg-accent text-primary',
  confirmed: 'bg-slate-100 text-muted',
} as const;

export function DashboardPreview() {
  const t = useTranslations('hero');
  const rows = [
    { time: '09:30', initials: 'SJ', name: 'Sarah Johnson', status: 'progress' as const },
    { time: '09:45', initials: 'MB', name: 'Michael Brown', status: 'checked' as const },
    { time: '10:30', initials: 'AK', name: 'Aisha Khan', status: 'confirmed' as const },
  ];
  const statusLabel = {
    progress: t('statusProgress'),
    checked: t('statusChecked'),
    confirmed: t('statusConfirmed'),
  };
  const kpis = [
    { icon: CalendarCheck, value: '48', label: t('kpiAppointments') },
    { icon: Users, value: '7', label: t('kpiWaiting') },
    { icon: Stethoscope, value: '8/10', label: t('kpiDoctors') },
    { icon: Clock, value: '12m', label: t('kpiWait') },
  ];
  const bars = [38, 52, 44, 70, 58, 82, 64, 47, 29];

  return (
    <div
      className="relative mx-auto w-full max-w-[560px]"
      role="img"
      aria-label={t('previewLabel')}
    >
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-linear-to-br from-[#5fd3bf]/25 via-transparent to-blue/15 blur-2xl" />

      <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_24px_60px_-12px_rgba(21,40,63,0.22)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
                {t('previewEyebrow')}
              </p>
              <p className="text-base font-bold text-navy">{t('previewGreeting')}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">
            <span className="live-dot h-2 w-2 rounded-full bg-teal" />
            {t('live')}
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="rounded-[16px] border border-border/80 bg-slate-50/70 p-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-white text-primary shadow-sm">
                  <Icon size={16} />
                </span>
                <p className="mt-2 text-xl font-bold text-navy">{value}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">{label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[16px] border border-border/80 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-navy">{t('activity')}</p>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                <TrendingUp size={13} />
                +12%
              </span>
            </div>
            <div className="flex h-20 items-end gap-2">
              {bars.map((value, index) => (
                <div
                  key={index}
                  className={`flex-1 rounded-t-[6px] ${
                    index === 5
                      ? 'bg-linear-to-t from-teal to-blue'
                      : 'bg-linear-to-t from-primary/25 to-primary/45'
                  }`}
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.time}
                className="flex items-center justify-between gap-3 rounded-[14px] border border-border/70 bg-white px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-11 shrink-0 text-xs font-medium text-muted tabular-nums">
                    {row.time}
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-accent to-[#e3f0fd] text-[11px] font-bold text-navy">
                    {row.initials}
                  </span>
                  <span className="truncate text-sm font-semibold text-text">{row.name}</span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[row.status]}`}
                >
                  {statusLabel[row.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="float absolute top-[42%] -end-8 hidden items-center gap-2 rounded-[16px] border border-white/80 bg-white/95 px-3.5 py-2.5 shadow-[0_14px_30px_-10px_rgba(21,40,63,0.25)] backdrop-blur sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-primary">
          <TrendingUp size={16} />
        </span>
        <span className="text-xs font-semibold text-navy">{t('floatUtil')}</span>
      </div>
      <div className="float float-delay absolute -bottom-6 -start-4 hidden items-center gap-2 rounded-[16px] border border-white/80 bg-white/95 px-3.5 py-2.5 shadow-[0_14px_30px_-10px_rgba(21,40,63,0.25)] backdrop-blur sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e3f0fd] text-blue">
          <UserCheck size={16} />
        </span>
        <span className="text-xs font-semibold text-navy">{t('floatQueue')}</span>
      </div>
    </div>
  );
}
