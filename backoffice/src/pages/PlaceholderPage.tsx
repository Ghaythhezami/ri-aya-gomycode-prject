import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <section className="panel relative flex min-h-[65vh] flex-col items-center justify-center overflow-hidden p-10 text-center">
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#d5eef6]/70 blur-3xl"
      />
      <div className="relative">
        <span className="relative mx-auto grid h-24 w-24 place-items-center rounded-[28px] border border-white bg-white shadow-[0_18px_40px_-16px_rgba(15,118,110,0.45)]">
          <img src="/riaya-mark.png" alt="" className="h-14 w-14 object-contain" />
          <span className="absolute -top-2 -end-2 grid h-8 w-8 place-items-center rounded-full bg-linear-to-br from-teal to-blue text-white shadow-md">
            <Sparkles size={15} />
          </span>
        </span>
        <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          {t('shell.comingSoonKicker')}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">{t(titleKey)}</h1>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-muted">
          {t('shell.notDeveloped')}
        </p>
      </div>
    </section>
  );
}
