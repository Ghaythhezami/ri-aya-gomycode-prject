import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center rounded-[16px] border border-dashed border-border bg-white p-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-accent text-primary">
        <Construction size={28} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-3 max-w-md text-muted">{t('shell.notDeveloped')}</p>
    </section>
  );
}
