import { useState } from 'react';
import { PlaneTakeoff, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DoctorDetail } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { useAddLeaveMutation, useDeleteLeaveMutation } from './api';
import { zonedInstant } from './hours';

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Leave list with add (date range + reason) and delete. */
export function LeavesPanel({ doctor, canEdit }: { doctor: DoctorDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const [addLeave, { isLoading: adding }] = useAddLeaveMutation();
  const [deleteLeave] = useDeleteLeaveMutation();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalid = !from || !to || to < from;
  const close = () => {
    setOpen(false);
    setFrom('');
    setTo('');
    setReason('');
    setError(null);
  };

  const submit = async () => {
    if (invalid) {
      setError(t('doctors.leaves.invalidRange'));
      return;
    }
    try {
      await addLeave({
        id: doctor.id,
        startsAt: zonedInstant(from, 0, fmt.timeZone),
        endsAt: zonedInstant(nextDay(to), 0, fmt.timeZone),
        reason: reason.trim() || undefined,
      }).unwrap();
      toast.success(t('doctors.leaves.added'));
      close();
    } catch (raw) {
      const e = asClinicError(raw);
      setError(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  };

  const remove = async (leaveId: string) => {
    try {
      await deleteLeave({ id: doctor.id, leaveId }).unwrap();
      toast.success(t('doctors.leaves.deleted'));
    } catch (raw) {
      const e = asClinicError(raw);
      toast.error(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  };

  return (
    <section
      aria-label={t('doctors.leaves.title')}
      className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">{t('doctors.leaves.title')}</h2>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} aria-hidden="true" />
            {t('doctors.leaves.add')}
          </Button>
        )}
      </div>
      {doctor.leaves.length === 0 ? (
        <p className="text-sm text-muted">{t('doctors.leaves.empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {doctor.leaves.map((leave) => (
            <li key={leave.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3">
                <PlaneTakeoff size={16} aria-hidden="true" className="text-alert" />
                <div>
                  <p className="text-sm font-medium text-text">
                    {fmt.date(leave.startsAt)} –{' '}
                    {fmt.date(new Date(new Date(leave.endsAt).getTime() - 1))}
                  </p>
                  {leave.reason && <p className="text-xs text-muted">{leave.reason}</p>}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
                  aria-label={t('doctors.leaves.delete', { date: fmt.date(leave.startsAt) })}
                  onClick={() => void remove(leave.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        title={t('doctors.leaves.add')}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close} disabled={adding}>
              {t('clinic.cancel')}
            </Button>
            <Button onClick={() => void submit()} disabled={adding}>
              {t('doctors.leaves.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('doctors.leaves.from')}>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('doctors.leaves.to')}>
            <Input
              type="date"
              dir="ltr"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('doctors.leaves.reason')}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm text-error sm:col-span-2">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
