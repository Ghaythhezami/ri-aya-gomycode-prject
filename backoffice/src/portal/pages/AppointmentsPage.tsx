import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { Skeleton } from '../../common/Skeleton';
import { EmptyState, ErrorState } from '../../common/States';
import { Tabs } from '../../common/Tabs';
import { useAppointmentsQuery } from '../api';
import { AppointmentCard } from '../components/AppointmentCard';
import { ButtonLink, PageTitle } from '../components/ui';

function List({ scope }: { scope: 'upcoming' | 'past' }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useAppointmentsQuery(scope);

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title={t('portal.appointments.loadError')}
        description={t('portal.appointments.loadErrorHint')}
        action={
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('portal.common.retry')}
          </Button>
        }
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t(`portal.appointments.empty.${scope}`)}
        description={t(`portal.appointments.empty.${scope}Hint`)}
        action={
          scope === 'upcoming' ? (
            <ButtonLink to="/portal/book">{t('portal.home.book')}</ButtonLink>
          ) : undefined
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {data.map((appointment) => (
        <li key={appointment.id}>
          <AppointmentCard appointment={appointment} showActions={scope === 'upcoming'} />
        </li>
      ))}
    </ul>
  );
}

export function PortalAppointmentsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={t('portal.appointments.title')}
        action={<ButtonLink to="/portal/book">{t('portal.home.book')}</ButtonLink>}
      />
      <Tabs
        label={t('portal.appointments.title')}
        value={tab}
        onChange={(id) => setTab(id as 'upcoming' | 'past')}
        tabs={[
          {
            id: 'upcoming',
            label: t('portal.appointments.upcoming'),
            content: <List scope="upcoming" />,
          },
          { id: 'past', label: t('portal.appointments.past'), content: <List scope="past" /> },
        ]}
      />
    </div>
  );
}
