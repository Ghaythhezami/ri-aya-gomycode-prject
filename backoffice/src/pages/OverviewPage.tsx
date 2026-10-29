import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { clearFirstRun, isFirstRun } from '../lib/firstRun';

export function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [firstRun, setFirstRun] = useState(isFirstRun);
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
      {firstRun && (
        <div className="mt-6 rounded-[16px] border border-border bg-white p-6 shadow-(--shadow-card)">
          <h2 className="text-lg font-semibold">{t('firstRun.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('firstRun.body')}</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              {t('firstRun.stepInvite')}{' '}
              <Link className="font-medium text-primary underline" to="/staff">
                {t('firstRun.inviteLink')}
              </Link>
            </li>
            <li>{t('firstRun.stepSettings')}</li>
          </ul>
          <button
            type="button"
            className="mt-4 text-sm font-medium text-primary underline"
            onClick={() => {
              clearFirstRun();
              setFirstRun(false);
            }}
          >
            {t('firstRun.dismiss')}
          </button>
        </div>
      )}
    </section>
  );
}
