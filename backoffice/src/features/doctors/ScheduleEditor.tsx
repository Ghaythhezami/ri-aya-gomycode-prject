import { useEffect, useMemo, useState } from 'react';
import { Coffee, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DoctorDetail, HoursConflict, WorkingInterval } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { usePutWorkingHoursMutation } from './api';
import {
  minutesToTime,
  timeToMinutes,
  validateIntervals,
  weekdayName,
  weekdayOrder,
  type HoursIssueCode,
} from './hours';

function sameIntervals(a: WorkingInterval[], b: WorkingInterval[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Weekly working-hours editor: work and break intervals per weekday (DOC-2). */
export function ScheduleEditor({ doctor, canEdit }: { doctor: DoctorDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useClinicFormat();
  const [save, { isLoading }] = usePutWorkingHoursMutation();
  const [draft, setDraft] = useState<WorkingInterval[]>(doctor.workingHours);
  const [conflicts, setConflicts] = useState<HoursConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(doctor.workingHours);
  }, [doctor.workingHours]);

  const dirty = !sameIntervals(draft, doctor.workingHours);
  const issues = useMemo(() => validateIntervals(draft), [draft]);
  const issueFor = (index: number): HoursIssueCode | undefined =>
    issues.find((i) => i.index === index)?.code;

  const patch = (index: number, change: Partial<WorkingInterval>) =>
    setDraft((d) => d.map((x, i) => (i === index ? { ...x, ...change } : x)));
  const remove = (index: number) => setDraft((d) => d.filter((_, i) => i !== index));
  const add = (weekday: number, kind: 'WORK' | 'BREAK') =>
    setDraft((d) => {
      const dayWork = d.filter((x) => x.weekday === weekday && x.kind === 'WORK');
      const base =
        kind === 'WORK'
          ? { startMinute: 9 * 60, endMinute: 17 * 60 }
          : dayWork[0]
            ? {
                startMinute: Math.min(dayWork[0].startMinute + 240, dayWork[0].endMinute - 30),
                endMinute: Math.min(dayWork[0].startMinute + 270, dayWork[0].endMinute),
              }
            : { startMinute: 12 * 60, endMinute: 12 * 60 + 30 };
      return [...d, { weekday, kind, ...base }];
    });

  const submit = async (confirm: boolean) => {
    setError(null);
    try {
      await save({ id: doctor.id, intervals: draft, confirm: confirm || undefined }).unwrap();
      toast.success(t('doctors.schedule.saved'));
      setConflicts(null);
    } catch (raw) {
      const e = asClinicError(raw);
      const found = (e?.details as { conflicts?: HoursConflict[] } | undefined)?.conflicts;
      if (e?.code === 'HOURS_CONFLICT' && Array.isArray(found)) {
        setConflicts(found);
        return;
      }
      setConflicts(null);
      setError(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  };

  return (
    <section
      aria-label={t('doctors.schedule.title')}
      className="rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card)"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">{t('doctors.schedule.title')}</h2>
        {canEdit && (
          <div className="flex items-center gap-3">
            {dirty && (
              <span role="status" className="text-sm text-warning">
                {t('doctors.schedule.unsaved')}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty || isLoading}
              onClick={() => setDraft(doctor.workingHours)}
            >
              {t('doctors.schedule.reset')}
            </Button>
            <Button
              size="sm"
              disabled={!dirty || issues.length > 0 || isLoading}
              aria-busy={isLoading || undefined}
              onClick={() => void submit(false)}
            >
              {t('clinic.save')}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-error">
          {error}
        </p>
      )}
      <ul className="divide-y divide-border">
        {weekdayOrder(fmt.locale).map((weekday) => {
          const rows = draft
            .map((interval, index) => ({ interval, index }))
            .filter((x) => x.interval.weekday === weekday)
            .sort((a, b) => a.interval.startMinute - b.interval.startMinute);
          const hasWork = rows.some((r) => r.interval.kind === 'WORK');
          return (
            <li
              key={weekday}
              className="grid gap-2 py-3 md:grid-cols-[9rem_1fr_auto] md:items-start"
            >
              <p className="pt-2 text-sm font-medium text-text">
                {weekdayName(weekday, fmt.locale)}
              </p>
              <div className="space-y-2">
                {!hasWork && (
                  <p className="pt-2 text-sm text-muted">{t('doctors.schedule.closed')}</p>
                )}
                {rows.map(({ interval, index }) => {
                  const issue = issueFor(index);
                  const kindLabel = t(`doctors.schedule.kind.${interval.kind}`);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex min-h-8 w-20 items-center gap-1 rounded-full px-2 text-xs font-medium ${
                          interval.kind === 'WORK'
                            ? 'bg-accent text-primary-dark'
                            : 'bg-warning/10 text-warning'
                        }`}
                      >
                        {interval.kind === 'BREAK' && <Coffee size={12} aria-hidden="true" />}
                        {kindLabel}
                      </span>
                      <input
                        type="time"
                        dir="ltr"
                        disabled={!canEdit}
                        aria-label={`${weekdayName(weekday, fmt.locale)} ${kindLabel} ${t('doctors.schedule.from')}`}
                        aria-invalid={issue ? true : undefined}
                        value={minutesToTime(interval.startMinute)}
                        onChange={(e) =>
                          patch(index, { startMinute: timeToMinutes(e.target.value) })
                        }
                        className="min-h-10 rounded-md border border-border-strong bg-surface px-2 text-text aria-[invalid=true]:border-error"
                      />
                      <span aria-hidden="true" className="text-muted">
                        –
                      </span>
                      <input
                        type="time"
                        dir="ltr"
                        disabled={!canEdit}
                        aria-label={`${weekdayName(weekday, fmt.locale)} ${kindLabel} ${t('doctors.schedule.to')}`}
                        aria-invalid={issue ? true : undefined}
                        value={minutesToTime(interval.endMinute)}
                        onChange={(e) => patch(index, { endMinute: timeToMinutes(e.target.value) })}
                        className="min-h-10 rounded-md border border-border-strong bg-surface px-2 text-text aria-[invalid=true]:border-error"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          aria-label={t('doctors.schedule.remove', {
                            day: weekdayName(weekday, fmt.locale),
                            kind: kindLabel,
                          })}
                          className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                      {issue && (
                        <span role="alert" className="basis-full text-xs text-error">
                          {t(`doctors.schedule.issue.${issue}`)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => add(weekday, 'WORK')}>
                    <Plus size={14} aria-hidden="true" />
                    {t('doctors.schedule.addInterval')}
                  </Button>
                  {hasWork && (
                    <Button variant="ghost" size="sm" onClick={() => add(weekday, 'BREAK')}>
                      <Coffee size={14} aria-hidden="true" />
                      {t('doctors.schedule.addBreak')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        open={conflicts !== null}
        title={t('doctors.schedule.conflictTitle')}
        onClose={() => setConflicts(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConflicts(null)} disabled={isLoading}>
              {t('clinic.cancel')}
            </Button>
            <Button onClick={() => void submit(true)} disabled={isLoading}>
              {t('doctors.schedule.saveAnyway')}
            </Button>
          </>
        }
      >
        <p>{t('doctors.schedule.conflictBody', { count: conflicts?.length ?? 0 })}</p>
        <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {(conflicts ?? []).map((c) => (
            <li
              key={c.appointmentId}
              className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm text-text"
            >
              <span>
                <span dir="ltr" className="font-medium">
                  {c.code}
                </span>{' '}
                · {c.patientName}
              </span>
              <span className="text-muted">{fmt.dateTime(c.startsAt)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
