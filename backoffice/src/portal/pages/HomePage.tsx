import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, FileText, HeartPulse } from 'lucide-react';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { useAppointmentsQuery, useDocumentsQuery, useSummaryQuery } from '../api';
import { AppointmentCard } from '../components/AppointmentCard';
import { ButtonLink, Card } from '../components/ui';
import { pickNext } from '../lib/appointments';
import { usePortalFormat } from '../lib/useFormat';
import { usePortalMe } from '../PortalAuthContext';

export function PortalHomePage() {
  const { t } = useTranslation();
  const me = usePortalMe();
  const format = usePortalFormat();
  const upcoming = useAppointmentsQuery('upcoming');
  const summary = useSummaryQuery();
  const documents = useDocumentsQuery();
  const next = useMemo(() => pickNext(upcoming.data ?? []), [upcoming.data]);
  const summaryText = summary.data?.content ?? '';
  const teaser =
    summaryText.length > 160 ? `${summaryText.slice(0, 157).trimEnd()}...` : summaryText;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {t('portal.home.greeting', { name: me.firstName })}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('portal.home.subtitle')}</p>
      </div>

      <section aria-labelledby="next-title">
        <h2 id="next-title" className="mb-2 text-lg font-semibold text-text">
          {t('portal.home.next')}
        </h2>
        {upcoming.isLoading ? (
          <Skeleton className="h-36" />
        ) : upcoming.isError ? (
          <ErrorState
            title={t('portal.appointments.loadError')}
            action={
              <Button variant="secondary" onClick={() => void upcoming.refetch()}>
                {t('portal.common.retry')}
              </Button>
            }
          />
        ) : next ? (
          <AppointmentCard appointment={next} />
        ) : (
          <EmptyState
            icon={<CalendarPlus size={18} aria-hidden />}
            title={t('portal.home.noNext')}
            description={t('portal.home.noNextHint')}
          />
        )}
      </section>

      <ButtonLink to="/portal/book" className="w-full sm:w-auto">
        <CalendarPlus size={18} aria-hidden />
        {t('portal.home.book')}
      </ButtonLink>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card aria-labelledby="home-summary">
          <h2
            id="home-summary"
            className="flex items-center gap-2 text-base font-semibold text-text"
          >
            <HeartPulse size={18} className="text-primary" aria-hidden />
            {t('portal.home.summary')}
          </h2>
          {summary.isLoading ? (
            <div className="mt-3">
              <Skeleton lines={3} />
            </div>
          ) : summary.data ? (
            <>
              <p className="mt-2 text-sm text-text">{teaser}</p>
              <p className="mt-1 text-xs text-muted">{format.date(summary.data.publishedAt)}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('portal.home.noSummary')}</p>
          )}
          <Link
            className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-primary underline"
            to="/portal/health"
          >
            {t('portal.home.openHealth')}
          </Link>
        </Card>
        <Card aria-labelledby="home-docs">
          <h2 id="home-docs" className="flex items-center gap-2 text-base font-semibold text-text">
            <FileText size={18} className="text-primary" aria-hidden />
            {t('portal.home.documents')}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {documents.isLoading
              ? t('portal.common.loading')
              : t('portal.home.documentsCount', { count: documents.data?.length ?? 0 })}
          </p>
          <Link
            className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-primary underline"
            to="/portal/health"
          >
            {t('portal.home.uploadDocument')}
          </Link>
        </Card>
      </div>
    </div>
  );
}
