import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import type { RoleSummary } from '@riaya/shared';
import { Button } from '../../common/Button';
import { DataTable, type Column } from '../../common/Table';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { StaffDirectoryPage } from '../../pages/StaffDirectoryPage';
import { useClinicFormat } from '../shared/format';
import { useSettingsRolesQuery } from './api';

type Row = RoleSummary & { id: string };

/** Roles table (read only) and the team and invitations area. */
export function RolesSection() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const roles = useSettingsRolesQuery();
  const rows: Row[] = (roles.data ?? []).map((r) => ({ ...r, id: r.role }));

  const columns: Column<Row>[] = [
    {
      key: 'role',
      header: t('settings.roles.role'),
      sortable: true,
      sortValue: (r) => t(`settings.roles.names.${r.role}`),
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <ShieldCheck size={16} aria-hidden="true" className="text-primary" />
          {t(`settings.roles.names.${r.role}`)}
        </span>
      ),
    },
    {
      key: 'accessLevel',
      header: t('settings.roles.access'),
      render: (r) => (
        <span>
          <span className="font-medium text-text">
            {t(`settings.roles.levels.${r.accessLevel}`)}
          </span>
          <span className="block text-xs text-muted">
            {t(`settings.roles.levelHelp.${r.accessLevel}`)}
          </span>
        </span>
      ),
    },
    {
      key: 'users',
      header: t('settings.roles.users'),
      sortable: true,
      render: (r) => fmt.number(r.users),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface shadow-(--shadow-card)">
        <div className="border-b border-border px-6 py-5">
          <h2 className="text-base font-semibold text-text">{t('settings.roles.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('settings.roles.subtitle')}</p>
        </div>
        <div className="px-6 py-5">
          {roles.isLoading && <Skeleton lines={4} />}
          {roles.isError && !roles.data && (
            <ErrorState
              title={t('settings.roles.loadError')}
              action={
                <Button variant="secondary" onClick={() => void roles.refetch()}>
                  {t('clinic.retry')}
                </Button>
              }
            />
          )}
          {roles.data && (
            <DataTable<Row>
              columns={columns}
              rows={rows}
              caption={t('settings.roles.title')}
              emptyLabel={t('settings.roles.empty')}
            />
          )}
        </div>
      </section>

      <section
        id="team"
        aria-labelledby="team-heading"
        className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
      >
        <div className="border-b border-border px-6 py-5">
          <h2 id="team-heading" className="text-base font-semibold text-text">
            {t('settings.team.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('settings.team.subtitle')}</p>
        </div>
        <div className="px-6 py-5">
          <StaffDirectoryPage />
        </div>
      </section>
    </div>
  );
}
