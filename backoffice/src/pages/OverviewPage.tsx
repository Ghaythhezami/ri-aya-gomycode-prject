import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const key =
    hour < 12 ? 'shell.greeting' : hour < 18 ? 'shell.greetingAfternoon' : 'shell.greetingEvening';

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {new Date().toLocaleDateString()}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(key, { name: user?.firstName ?? '' })}
      </h1>
      <p className="mt-2 text-muted">{t('shell.subtitle')}</p>
    </section>
  );
}
