import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Send } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { canUser } from '../../auth/permissions';
import { Skeleton } from '../../common/Skeleton';
import { useClinicFormat } from '../shared/format';
import { useNotificationDeliveryStatsQuery } from './api';

export function DeliveryCard() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const { user } = useAuth();
  const stats = useNotificationDeliveryStatsQuery(undefined, {
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });
  const d = stats.data;
  const rows: { label: string; value: number; warn?: boolean }[] = d
    ? [
        { label: t('notifications.delivery.sms'), value: d.sms },
        { label: t('notifications.delivery.email'), value: d.email },
        { label: t('notifications.delivery.pending'), value: d.pending },
        { label: t('notifications.delivery.failed'), value: d.failed, warn: d.failed > 0 },
      ]
    : [];
  return (
    <aside
      aria-label={t('notifications.delivery.title')}
      className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-text">
        {t('notifications.delivery.title')}
      </h2>
      <div className="p-5">
        {stats.isLoading && <Skeleton className="h-24" />}
        {stats.isError && !d && (
          <div className="text-sm text-error" role="alert">
            {t('notifications.delivery.error')}{' '}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void stats.refetch()}
            >
              {t('clinic.retry')}
            </button>
          </div>
        )}
        {d && (
          <>
            <div className="rounded-md bg-accent p-4 text-center">
              <p className="text-3xl font-semibold text-primary">
                {fmt.number(d.successRate, { maximumFractionDigits: 1 })}%
              </p>
              <p className="text-xs text-primary-dark">{t('notifications.delivery.success')}</p>
            </div>
            <dl className="mt-3">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-b-0"
                >
                  <dt className="flex items-center gap-1.5 text-muted">
                    {r.warn && (
                      <AlertTriangle size={13} aria-hidden="true" className="text-error" />
                    )}
                    {r.label}
                  </dt>
                  <dd className={`font-semibold ${r.warn ? 'text-error' : 'text-text'}`}>
                    {fmt.number(r.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {canUser(user, 'manageSettings') && (
          <Link
            to="/settings/reminders"
            className="mt-3 flex min-h-11 items-center justify-center rounded-md border border-border text-sm font-medium text-text hover:bg-bg"
          >
            {t('notifications.delivery.manage')}
          </Link>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <Send size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t('notifications.delivery.note')}
        </p>
      </div>
    </aside>
  );
}
