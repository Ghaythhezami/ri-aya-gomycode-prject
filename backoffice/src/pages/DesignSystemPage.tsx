import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DataTable, StatusCell } from '../common/Table';
import { StatusDonutChart, WaitTrendChart, WeeklyVolumeChart } from '../common/charts/SampleCharts';
import { color, elevation, font, radius, space } from '../design-system/tokens';

/** Rendered from the token module, so this page cannot drift from the stylesheet. */
const swatches: { name: string; value: string }[] = [
  { name: 'primary', value: color.primary },
  { name: 'primary-dark', value: color['primary-dark'] },
  { name: 'navy', value: color.navy },
  { name: 'bg', value: color.bg },
  { name: 'surface', value: color.surface },
  { name: 'text', value: color.text },
  { name: 'muted', value: color.muted },
  { name: 'border', value: color.border },
  { name: 'border-strong', value: color['border-strong'] },
  { name: 'success', value: color.success },
  { name: 'warning', value: color.warning },
  { name: 'error', value: color.error },
  { name: 'accent', value: color.accent },
];

const scales: { group: string; entries: { name: string; value: string }[] }[] = [
  { group: 'radius', entries: Object.entries(radius).map(([name, value]) => ({ name, value })) },
  { group: 'space', entries: Object.entries(space).map(([name, value]) => ({ name, value })) },
  {
    group: 'elevation',
    entries: Object.entries(elevation).map(([name, value]) => ({ name, value })),
  },
  { group: 'font', entries: Object.entries(font).map(([name, value]) => ({ name, value })) },
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
          {swatches.map(({ name, value }) => (
            <div key={name} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-12 rounded-md border border-border" style={{ background: value }} />
              <p className="mt-3 text-sm font-medium capitalize">{name}</p>
              <p className="text-xs text-muted">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t('ds.scales')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {scales.map(({ group, entries }) => (
            <div key={group} className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-medium capitalize">{group}</h3>
              <dl className="mt-2 space-y-1">
                {entries.map(({ name, value }) => (
                  <div key={name} className="flex items-baseline justify-between gap-3 text-xs">
                    <dt className="font-medium">{name}</dt>
                    <dd className="truncate text-muted">{value}</dd>
                  </div>
                ))}
              </dl>
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
          <div className="rounded-lg border border-border bg-surface p-4">
            <WeeklyVolumeChart />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <StatusDonutChart />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <WaitTrendChart />
          </div>
        </div>
      </section>
    </div>
  );
}
