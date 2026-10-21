import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DataTable, StatusCell } from '../common/Table';
import { StatusDonutChart, WaitTrendChart, WeeklyVolumeChart } from '../common/charts/SampleCharts';

const tokens = [
  ['primary', '#0F766E'],
  ['navy', '#15283F'],
  ['background', '#F7F9FC'],
  ['surface', '#FFFFFF'],
  ['text', '#172B4D'],
  ['secondary text', '#697586'],
  ['border', '#E5EAF0'],
  ['success', '#16A34A'],
  ['warning', '#F59E0B'],
  ['error', '#DC2626'],
  ['accent', '#DDF6F3'],
];

const rows = [
  {
    id: '1',
    patient: 'Sarah Johnson',
    doctor: 'Dr. Emily Carter',
    type: 'Consultation',
    status: 'In progress',
  },
  {
    id: '2',
    patient: 'Michael Brown',
    doctor: 'Dr. James Wilson',
    type: 'Follow-up',
    status: 'Checked in',
  },
  {
    id: '3',
    patient: 'Aisha Khan',
    doctor: 'Dr. Sarah Ahmed',
    type: 'Consultation',
    status: 'Confirmed',
  },
];

export function DesignSystemPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {t('ds.kicker')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{t('ds.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t('ds.intro')}</p>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.tokens')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tokens.map(([name, value]) => (
            <div key={name} className="rounded-[16px] border border-border bg-white p-4">
              <div
                className="h-12 rounded-[12px] border border-border"
                style={{ background: value }}
              />
              <p className="mt-3 text-sm font-medium capitalize">{name}</p>
              <p className="text-xs text-muted">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.buttons')}</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.modal')}</h2>
        <Button onClick={() => setOpen(true)}>{t('ds.openModal')}</Button>
        <Modal
          open={open}
          title={t('ds.modalTitle')}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('ds.cancel')}
              </Button>
              <Button onClick={() => setOpen(false)}>{t('ds.confirm')}</Button>
            </>
          }
        >
          {t('ds.modalBody')}
        </Modal>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.table')}</h2>
        <p className="mb-3 text-xs text-muted">{t('ds.sample')}</p>
        <DataTable
          caption={t('ds.table')}
          rows={rows}
          columns={[
            { key: 'patient', header: 'Patient' },
            { key: 'doctor', header: 'Doctor' },
            { key: 'type', header: 'Type' },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusCell status={row.status} />,
            },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.charts')}</h2>
        <p className="mb-3 text-xs text-muted">{t('ds.sample')}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[16px] border border-border bg-white p-4">
            <WeeklyVolumeChart />
          </div>
          <div className="rounded-[16px] border border-border bg-white p-4">
            <StatusDonutChart />
          </div>
          <div className="rounded-[16px] border border-border bg-white p-4">
            <WaitTrendChart />
          </div>
        </div>
      </section>
    </div>
  );
}
