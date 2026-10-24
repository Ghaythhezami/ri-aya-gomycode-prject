import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DesignSystemPage } from './DesignSystemPage';
import { LanguageSwitcher } from '../layouts/LanguageSwitcher';

const site = import.meta.env.VITE_SITE_URL || 'http://localhost:3000';

export function PublicUiPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-white/90 px-4 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="RI'AYA"
            className="h-11 w-11 rounded-xl bg-black object-cover"
          />
          <div>
            <p className="text-sm font-semibold">{t('app.name')}</p>
            <p className="text-xs text-muted">{t('ds.kicker')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <a className="text-sm text-muted" href={site}>
            {t('ds.backHome')}
          </a>
          <Link
            className="rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white"
            to="/login"
          >
            {t('auth.signIn')}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 lg:p-8">
        <DesignSystemPage />
      </main>
    </div>
  );
}
