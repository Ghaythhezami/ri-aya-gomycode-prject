import { Construction, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section className="rise relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface p-10 text-center shadow-(--shadow-soft)">
      <div
        aria-hidden="true"
        className="blob-teal absolute -top-24 -start-24 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="blob-blue absolute -bottom-24 -end-24 size-72 rounded-full blur-3xl"
      />
      <div className="relative">
        <span className="float relative grid size-20 place-items-center rounded-2xl bg-surface text-primary shadow-(--shadow-float)">
          <Construction size={32} aria-hidden="true" />
          <span className="brand-gradient absolute -end-2 -top-2 grid size-7 place-items-center rounded-full text-white shadow-(--shadow-glow)">
            <Sparkles size={14} aria-hidden="true" />
          </span>
        </span>
      </div>
      <h1 className="relative mt-7 text-3xl font-bold tracking-tight text-navy">{t(titleKey)}</h1>
      <p className="relative mt-3 max-w-md text-muted">{t('shell.notDeveloped')}</p>
      <div aria-hidden="true" className="relative mt-8 flex gap-1.5">
        <span className="h-1.5 w-8 rounded-full bg-primary" />
        <span className="h-1.5 w-4 rounded-full bg-mint" />
        <span className="h-1.5 w-2 rounded-full bg-blue" />
      </div>
    </section>
  );
}
