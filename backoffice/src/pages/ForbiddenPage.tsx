import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../common/Button';

/** Localized 403 surface for an authenticated user whose role lacks a route. */
export function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-8 text-center">
      <ShieldAlert className="mx-auto text-warning" size={32} aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold text-text">{t('forbidden.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('forbidden.body')}</p>
      <Button className="mt-6" onClick={() => navigate('/')}>
        {t('forbidden.back')}
      </Button>
    </section>
  );
}
