import { useTranslations } from 'next-intl';

export function DashboardPreview() {
  const t = useTranslations('hero');
  const rows = [
    ['09:30', 'SJ', 'Sarah Johnson', 'In progress'],
    ['09:45', 'MB', 'Michael Brown', 'Checked in'],
    ['10:30', 'AK', 'Aisha Khan', 'Confirmed'],
    ['11:15', 'DL', 'David Lee', 'Confirmed'],
  ];

  return (
    <div className="relative" aria-label={t('previewLabel')}>
      <div className="overflow-hidden rounded-[16px] border border-border bg-white p-4 shadow-[0_24px_60px_rgba(21,40,63,0.08)] sm:p-5">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['48', "Today's appointments"],
            ['7', 'Patients waiting'],
            ['8/10', 'Available doctors'],
            ['12 min', 'Average wait'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[12px] border border-border bg-bg p-3">
              <p className="text-xl font-semibold text-text">{value}</p>
              <p className="mt-1 text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {rows.map(([time, initials, name, status]) => (
            <div
              key={time}
              className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] bg-accent/60 px-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted">{time}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold">
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
