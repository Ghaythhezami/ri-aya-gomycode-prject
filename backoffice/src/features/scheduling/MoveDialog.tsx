import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SchedulingDay } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { formatMinute, type RenderBlock } from './gridMath';

/** Keyboard- and screen-reader-friendly alternative to dragging: pick a doctor and a time. */
export function MoveDialog({
  block,
  day,
  slot,
  onConfirm,
  onClose,
}: {
  block: RenderBlock | null;
  day: SchedulingDay;
  slot: number;
  onConfirm: (block: RenderBlock, doctorId: string, startMinute: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const doctorId = useId();
  const timeId = useId();
  const [doctor, setDoctor] = useState(block?.doctorId ?? '');
  const [minute, setMinute] = useState(block?.startMinute ?? day.dayStartMinute);

  if (!block) return null;
  const times: number[] = [];
  for (let m = day.dayStartMinute; m + block.durationMinutes <= day.dayEndMinute; m += slot) {
    times.push(m);
  }

  return (
    <Modal
      open
      title={t('scheduling.moveDialog.title', { name: block.patientName })}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('clinic.cancel')}
          </Button>
          <Button onClick={() => onConfirm(block, doctor || block.doctorId, minute)}>
            {t('scheduling.moveDialog.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={doctorId} className="mb-1.5 block text-sm font-medium text-text">
            {t('scheduling.moveDialog.doctor')}
          </label>
          <Select id={doctorId} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            {day.doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={timeId} className="mb-1.5 block text-sm font-medium text-text">
            {t('scheduling.moveDialog.time')}
          </label>
          <Select
            id={timeId}
            dir="ltr"
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
          >
            {times.map((m) => (
              <option key={m} value={m}>
                {formatMinute(m)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  );
}
