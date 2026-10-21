import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-[16px] border border-border bg-white p-8">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-2 text-muted">{t('shell.comingSoon')}</p>
    </section>
  );
}
