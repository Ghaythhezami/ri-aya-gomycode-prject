'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, CheckCircle2, ClipboardList, ShieldCheck, Stethoscope } from 'lucide-react';

const roles = [
  { id: 'clinic', icon: Building2 },
  { id: 'doctor', icon: Stethoscope },
  { id: 'reception', icon: ClipboardList },
  { id: 'super', icon: ShieldCheck },
] as const;

export function RolesTabs() {
  const t = useTranslations('roles');
  const [active, setActive] = useState<(typeof roles)[number]['id']>('clinic');
  const current = roles.find((role) => role.id === active) ?? roles[0];
  const ActiveIcon = current.icon;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-10">
      <div
        role="tablist"
        aria-label={t('kicker')}
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {roles.map(({ id, icon: Icon }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              id={`role-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="role-panel"
              onClick={() => setActive(id)}
              className={`flex shrink-0 items-center gap-3 rounded-[18px] border px-4 py-3 text-start transition lg:py-4 ${
                selected
                  ? 'border-primary/20 bg-white shadow-[0_12px_30px_-14px_rgba(15,118,110,0.45)]'
                  : 'border-transparent hover:bg-white/60'
              }`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] transition ${
                  selected
                    ? 'bg-linear-to-br from-teal to-blue text-white'
                    : 'bg-accent text-primary'
                }`}
              >
                <Icon size={20} />
              </span>
              <span>
                <span className="block text-sm font-bold whitespace-nowrap text-navy">
                  {t(`${id}.title`)}
                </span>
                <span className="mt-0.5 hidden text-xs text-muted lg:block">
                  {t(`${id}.short`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="role-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${active}`}
        className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_60px_-12px_rgba(21,40,63,0.15)] backdrop-blur-xl sm:p-10"
      >
        <ActiveIcon
          aria-hidden
          size={180}
          strokeWidth={1}
          className="pointer-events-none absolute -end-8 -bottom-8 text-primary/[0.06]"
        />
        <div key={active} className="rise relative">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            {t(`${active}.title`)}
          </p>
          <h3 className="mt-3 max-w-lg text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {t(`${active}.headline`)}
          </h3>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">{t(`${active}.body`)}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {(['p1', 'p2', 'p3'] as const).map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-[16px] border border-border/80 bg-slate-50/70 p-4 sm:flex-col"
              >
                <CheckCircle2 size={20} className="shrink-0 text-teal" />
                <span className="text-sm leading-snug font-medium text-text">
                  {t(`${active}.${point}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
