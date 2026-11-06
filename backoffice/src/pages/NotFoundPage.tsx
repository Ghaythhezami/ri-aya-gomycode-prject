import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react';

/** UI-2: 404 inside the shell, so navigation stays available. */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
        <SearchX size={26} aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">{t('shellx.notFoundTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('shellx.notFoundBody')}</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-surface"
      >
        {t('shellx.backHome')}
      </Link>
    </section>
  );
}
