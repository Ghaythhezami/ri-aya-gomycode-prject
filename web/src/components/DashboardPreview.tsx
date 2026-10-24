import { useTranslations } from 'next-intl';

export function DashboardPreview() {
  const t = useTranslations('hero');
  const rows = [
    ['09:30', 'SJ', 'Sarah Johnson', t('statusProgress')],
    ['09:45', 'MB', 'Michael Brown', t('statusChecked')],
    ['10:30', 'AK', 'Aisha Khan', t('statusConfirmed')],
    ['11:15', 'DL', 'David Lee', t('statusConfirmed')],
  ];
  const kpis = [
    ['48', t('kpiAppointments')],
    ['7', t('kpiWaiting')],
    ['8/10', t('kpiDoctors')],
    ['12 min', t('kpiWait')],
  ];
  const bars = [38, 52, 44, 70, 58, 41, 29];

  return (
    <div className="relative" aria-label={t('previewLabel')}>
      <div className="overflow-hidden rounded-[20px] border border-white/80 bg-white p-4 shadow-[0_28px_70px_rgba(15,118,110,0.12)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted">{t('previewEyebrow')}</p>
            <p className="text-lg font-semibold text-navy">{t('previewGreeting')}</p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">
            {t('live')}
          </span>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(([value, label]) => (
            <div key={label} className="rounded-[12px] border border-border bg-bg p-3">
              <p className="text-xl font-semibold text-text">{value}</p>
              <p className="mt-1 text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mb-4 rounded-[12px] border border-border bg-bg/80 p-3">
          <p className="mb-2 text-xs font-semibold text-muted">{t('activity')}</p>
          <div className="flex h-16 items-end gap-1.5">
            {bars.map((value, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-md bg-primary/80"
                style={{ height: `${value}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {rows.map(([time, initials, name, status]) => (
            <div
              key={time}
              className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] bg-accent/70 px-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted">{time}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold text-navy">
                  {initials}
                </span>
                <span className="truncate text-sm font-medium">{name}</span>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] text-primary">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -top-4 end-4 rounded-[12px] border border-border bg-white px-3 py-2 text-xs font-medium shadow-sm">
        {t('floatUtil')}
      </div>
      <div className="absolute -bottom-4 start-6 rounded-[12px] border border-border bg-white px-3 py-2 text-xs font-medium shadow-sm">
        {t('floatQueue')}
      </div>
    </div>
  );
}
