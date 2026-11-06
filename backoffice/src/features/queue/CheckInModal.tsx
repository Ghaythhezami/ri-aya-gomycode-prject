import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppointmentListItem, QueuePriority } from '@riaya/shared';
import { QUEUE_PRIORITIES } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Input, Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useClinicFormat } from '../shared/format';

/** Desk check-in: pick an expected appointment and a priority. */
export function CheckInModal({
  open,
  expected,
  busy,
  onClose,
  onCheckIn,
}: {
  open: boolean;
  expected: AppointmentListItem[];
  busy: boolean;
  onClose: () => void;
  onCheckIn: (appointmentId: string, priority: QueuePriority) => void;
}) {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<QueuePriority>('NORMAL');

  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? expected.filter(
            (a) =>
              a.patient.name.toLowerCase().includes(needle) ||
              a.patient.code.toLowerCase().includes(needle) ||
              a.code.toLowerCase().includes(needle),
          )
        : expected,
    [expected, needle],
  );

  return (
    <Modal open={open} title={t('queue.checkIn.title')} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('queue.checkIn.search')}
          aria-label={t('queue.checkIn.search')}
        />
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value as QueuePriority)}
          aria-label={t('queue.checkIn.priority')}
        >
          {QUEUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`clinic.priority.${p}`)}
            </option>
          ))}
        </Select>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-center text-sm text-muted">
          {expected.length === 0 ? t('queue.checkIn.none') : t('queue.checkIn.noMatch', { query })}
        </p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{a.patient.name}</p>
                <p className="truncate text-xs text-muted">
                  <span dir="ltr">{a.code}</span> · {fmt.time(a.startsAt)} · {a.doctor.name}
                </p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => onCheckIn(a.id, priority)}>
                {t('queue.checkIn.action')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
