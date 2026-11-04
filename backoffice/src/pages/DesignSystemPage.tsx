import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DatePicker, TimePicker } from '../common/DatePicker';
import { Dropdown } from '../common/Dropdown';
import { Field, Input, Select, Textarea } from '../common/Input';
import { KpiCard } from '../common/KpiCard';
import { Modal } from '../common/Modal';
import { Popover } from '../common/Popover';
import { SearchableSelect } from '../common/SearchableSelect';
import { Skeleton } from '../common/Skeleton';
import { EmptyState, ErrorState } from '../common/States';
import { DataTable, StatusCell } from '../common/Table';
import { Tabs } from '../common/Tabs';
import { ToastProvider, useToast } from '../common/Toast';
import { Tooltip } from '../common/Tooltip';
import { StatusDonutChart, WaitTrendChart, WeeklyVolumeChart } from '../common/charts/SampleCharts';
import { color, tokens, type TokenGroup } from '../design-system/tokens';

/** Rendered from the token module, so this page cannot drift from the stylesheet. */
const groups: { group: TokenGroup; entries: { name: string; value: string }[] }[] = [
  { group: 'color', entries: Object.entries(color).map(([name, value]) => ({ name, value })) },
  ...(['font', 'radius', 'space', 'elevation'] as const).map((group) => ({
    group,
    entries: Object.entries(tokens[group]).map(([name, value]) => ({ name, value: String(value) })),
  })),
];

const doctors = [
  { value: 'carter', label: 'Dr. Emily Carter' },
  { value: 'wilson', label: 'Dr. James Wilson' },
  { value: 'ahmed', label: 'Dr. Sarah Ahmed' },
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

const badgeTones = ['success', 'warning', 'error', 'neutral', 'info'] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Card wrapper for a single primitive plus its state variants. */
function Sample({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{name}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <ToastProvider>
      <DesignSystemContent />
    </ToastProvider>
  );
}

function DesignSystemContent() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [doctor, setDoctor] = useState<string | null>('carter');
  const [date, setDate] = useState('2026-11-04');
  const [time, setTime] = useState('09:30');
  const [location, setLocation] = useState('main');

  return (
    <div className="space-y-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {t('ds.kicker')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{t('ds.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t('ds.intro')}</p>
      </header>

      <Section id="ds-tokens" title={t('ds.tokens')} description={t('ds.tokensIntro')}>
        <div className="space-y-4">
          {groups.map(({ group, entries }) => (
            <div key={group} className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold capitalize">{group}</h3>
              {group === 'color' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {entries.map(({ name, value }) => (
                    <div key={name} className="rounded-md border border-border p-3">
                      <div
                        className="h-10 rounded-sm border border-border"
                        style={{ background: value }}
                      />
                      <p className="mt-2 text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <dl className="mt-3 divide-y divide-border">
                  {entries.map(({ name, value }) => (
                    <div key={name} className="flex items-baseline justify-between gap-4 py-2">
                      <dt className="text-sm font-medium">{name}</dt>
                      <dd className="truncate text-xs text-muted" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section id="ds-forms" title={t('ds.forms')} description={t('ds.formsIntro')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Sample name={t('ds.buttons')}>
            <div className="flex flex-wrap gap-3">
              <Button>{t('ds.primary')}</Button>
              <Button variant="secondary">{t('ds.secondary')}</Button>
              <Button variant="ghost">{t('ds.ghost')}</Button>
              <Button variant="danger">{t('ds.danger')}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">{t('ds.small')}</Button>
              <Button size="lg">{t('ds.large')}</Button>
              <Button disabled>{t('ds.disabled')}</Button>
            </div>
          </Sample>

          <Sample name={t('ds.inputs')}>
            <Field label={t('ds.fieldLabel')} help={t('ds.fieldHelp')}>
              <Input placeholder={t('ds.placeholder')} />
            </Field>
            <Field label={t('ds.fieldInvalid')} error={t('ds.fieldError')}>
              <Input defaultValue="not-an-email" invalid onChange={() => {}} />
            </Field>
            <Field label={t('ds.textarea')}>
              <Textarea placeholder={t('ds.placeholder')} />
            </Field>
            <Field label={t('ds.select')}>
              <Select value={location} onChange={(event) => setLocation(event.target.value)}>
                <option value="main">{t('ds.locationMain')}</option>
                <option value="branch">{t('ds.locationBranch')}</option>
              </Select>
            </Field>
          </Sample>

          <Sample name={t('ds.searchable')}>
            <SearchableSelect
              label={t('ds.doctor')}
              options={doctors}
              value={doctor}
              onChange={setDoctor}
              noResultsLabel={t('ds.noResults')}
            />
            <p className="text-xs text-muted">
              {t('ds.selected')}: {doctors.find((option) => option.value === doctor)?.label ?? '—'}
            </p>
          </Sample>

          <Sample name={t('ds.dateTime')}>
            <DatePicker
              label={t('ds.date')}
              value={date}
              onChange={setDate}
              locale={i18n.language}
            />
            <TimePicker
              label={t('ds.time')}
              value={time}
              onChange={setTime}
              locale={i18n.language}
            />
            <p className="text-xs text-muted">
              {t('ds.storedValue')}: <span dir="ltr">{date}</span> · <span dir="ltr">{time}</span>
            </p>
          </Sample>
        </div>

        <Sample name={t('ds.badges')}>
          <div className="flex flex-wrap gap-2">
            {badgeTones.map((tone) => (
              <Badge key={tone} tone={tone}>
                {t(`ds.tone.${tone}`)}
              </Badge>
            ))}
          </div>
        </Sample>
      </Section>

      <Section id="ds-navigation" title={t('ds.navigation')} description={t('ds.navigationIntro')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Sample name={t('ds.tabs')}>
            <Tabs
              label={t('ds.tabs')}
              value={tab}
              onChange={setTab}
              tabs={[
                {
                  id: 'upcoming',
                  label: t('ds.tabUpcoming'),
                  count: 3,
                  content: <p className="text-sm text-muted">{t('ds.tabUpcomingBody')}</p>,
                },
                {
                  id: 'past',
                  label: t('ds.tabPast'),
                  content: <p className="text-sm text-muted">{t('ds.tabPastBody')}</p>,
                },
              ]}
            />
          </Sample>

          <Sample name={t('ds.overlays')}>
            <div className="flex flex-wrap items-center gap-3">
              <Dropdown
                label={t('ds.moreActions')}
                trigger={<Button variant="secondary">{t('ds.moreActions')}</Button>}
                items={[
                  { id: 'view', label: t('ds.view'), onSelect: () => toast.info(t('ds.view')) },
                  {
                    id: 'reschedule',
                    label: t('ds.reschedule'),
                    onSelect: () => setModalOpen(true),
                  },
                  {
                    id: 'cancel',
                    label: t('ds.cancelVisit'),
                    tone: 'danger',
                    onSelect: () => setConfirmOpen(true),
                  },
                ]}
              />
              <Popover
                label={t('ds.details')}
                trigger={(state) => (
                  // A native button so the trigger ref can be attached directly.
                  <button
                    ref={state.ref}
                    type="button"
                    aria-expanded={state.open}
                    onClick={state.toggle}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text transition hover:bg-bg"
                  >
                    {t('ds.details')}
                  </button>
                )}
              >
                <p className="text-sm">{t('ds.popoverBody')}</p>
              </Popover>
              <Tooltip content={t('ds.tooltipText')}>
                <Button variant="ghost">{t('ds.tooltip')}</Button>
              </Tooltip>
              <Button onClick={() => setModalOpen(true)}>{t('ds.openModal')}</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                {t('ds.openConfirm')}
              </Button>
            </div>
          </Sample>
        </div>

        <Modal
          open={modalOpen}
          title={t('ds.modalTitle')}
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                {t('ds.cancel')}
              </Button>
              <Button onClick={() => setModalOpen(false)}>{t('ds.confirm')}</Button>
            </>
          }
        >
          {t('ds.modalBody')}
        </Modal>

        <ConfirmDialog
          open={confirmOpen}
          title={t('ds.confirmTitle')}
          confirmLabel={t('ds.cancelVisit')}
          cancelLabel={t('ds.keepVisit')}
          tone="danger"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            toast.success(t('ds.cancelledToast'));
          }}
        >
          {t('ds.confirmBody')}
        </ConfirmDialog>
      </Section>

      <Section id="ds-data" title={t('ds.data')} description={t('ds.dataIntro')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label={t('ds.kpiInQueue')}
            value={24}
            delta={{ value: 8, period: t('ds.vsYesterday') }}
          />
          <KpiCard
            label={t('ds.kpiWait')}
            value="12"
            unit={t('ds.minutes')}
            delta={{ value: -5, period: t('ds.vsYesterday'), invert: true }}
          />
          <KpiCard
            label={t('ds.kpiRooms')}
            value={6}
            delta={{ value: 0, period: t('ds.vsYesterday') }}
          />
        </div>

        <Sample name={t('ds.table')}>
          <p className="text-xs text-muted">{t('ds.sample')}</p>
          <DataTable
            caption={t('ds.table')}
            rows={rows}
            columns={[
              { key: 'patient', header: t('ds.colPatient') },
              { key: 'doctor', header: t('ds.colDoctor') },
              { key: 'type', header: t('ds.colType') },
              {
                key: 'status',
                header: t('ds.colStatus'),
                render: (row) => <StatusCell status={row.status} />,
              },
            ]}
          />
        </Sample>

        <Sample name={t('ds.charts')}>
          <p className="text-xs text-muted">{t('ds.sample')}</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <WeeklyVolumeChart />
            </div>
            <div className="rounded-lg border border-border p-4">
              <StatusDonutChart />
            </div>
            <div className="rounded-lg border border-border p-4">
              <WaitTrendChart />
            </div>
          </div>
        </Sample>

        <Sample name={t('ds.skeleton')}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton lines={3} />
        </Sample>
      </Section>

      <Section id="ds-feedback" title={t('ds.feedback')} description={t('ds.feedbackIntro')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success(t('ds.toastSuccess'))}>
            {t('ds.showSuccess')}
          </Button>
          <Button variant="secondary" onClick={() => toast.error(t('ds.toastError'))}>
            {t('ds.showError')}
          </Button>
          <Button variant="secondary" onClick={() => toast.info(t('ds.toastInfo'))}>
            {t('ds.showInfo')}
          </Button>
        </div>
      </Section>

      <Section id="ds-states" title={t('ds.states')} description={t('ds.statesIntro')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            title={t('ds.emptyTitle')}
            description={t('ds.emptyBody')}
            action={<Button>{t('ds.emptyAction')}</Button>}
          />
          <ErrorState
            title={t('ds.errorTitle')}
            description={t('ds.errorBody')}
            action={<Button variant="secondary">{t('ds.errorAction')}</Button>}
          />
        </div>
      </Section>
    </div>
  );
}
