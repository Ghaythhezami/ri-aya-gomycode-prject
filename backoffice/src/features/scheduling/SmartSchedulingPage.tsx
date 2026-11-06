import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  X,
  Zap,
} from 'lucide-react';
import type { OptimizationObjective, OptimizationProposal } from '@riaya/shared';
import { OPTIMIZATION_OBJECTIVES } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Select } from '../../common/Input';
import { EmptyState, ErrorState } from '../../common/States';
import { Skeleton } from '../../common/Skeleton';
import { useToast } from '../../common/Toast';
import { asClinicError, clinicApi } from '../../store/clinicApi';
import { PageHeader } from '../shared/PageHeader';
import { useClinicFormat } from '../shared/format';
import { useClinicReferenceQuery } from '../shared/api';
import { useDashboardQuery } from '../dashboard/api';
import {
  useSchedulingApplyMutation,
  useSchedulingDayQuery,
  useSchedulingOptimizeMutation,
  useSchedulingRescheduleMutation,
  useSchedulingUndoMutation,
  useSchedulingValidateMoveMutation,
} from './api';
import {
  DEFAULT_SLOT_MINUTES,
  applyPending,
  shiftDate,
  zonedToUtcIso,
  type PendingMove,
  type RenderBlock,
} from './gridMath';
import { initialInsightsState, insightsPhase, insightsReducer } from './insightsState';
import { InsightsPanel, reasonTail, type IdleDoctor } from './InsightsPanel';
import { MobileScheduleList } from './MobileScheduleList';
import { MoveDialog } from './MoveDialog';
import { ScheduleGrid, type GridMoveRequest } from './ScheduleGrid';
import { focusTarget, type FocusTarget } from './focusTarget';
import { useUnsavedGuard } from './useUnsavedGuard';

const OBJECTIVE_KEYS: Record<OptimizationObjective, string> = {
  MIN_WAIT: 'minWait',
  MAX_UTILISATION: 'maxUtilisation',
  REDUCE_GAPS: 'reduceGaps',
};

function Metric({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 md:border-s md:border-border md:px-6 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}

/** Day switcher: previous/next arrows around a button that opens the native date picker. */
function DateNav({
  date,
  label,
  display,
  onChange,
}: {
  date: string;
  label: string;
  display: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const arrow =
    'grid size-10 place-items-center rounded-md border border-border text-muted hover:bg-bg hover:text-text';
  return (
    <div className="col-span-2 min-w-0 md:col-span-1 md:pe-6">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          className={arrow}
          aria-label={t('scheduling.prevDay')}
          onClick={() => onChange(shiftDate(date, -1))}
        >
          <ChevronLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label={`${label}: ${display}`}
            onClick={() => {
              try {
                input.current?.showPicker();
              } catch {
                input.current?.focus();
              }
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-lg font-semibold text-text hover:bg-bg"
          >
            <CalendarDays size={16} aria-hidden="true" className="text-primary" />
            {display}
          </button>
          <input
            ref={input}
            type="date"
            dir="ltr"
            tabIndex={-1}
            aria-hidden="true"
            value={date}
            onChange={(e) => onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 size-full opacity-0"
          />
        </div>
        <button
          type="button"
          className={arrow}
          aria-label={t('scheduling.nextDay')}
          onClick={() => onChange(shiftDate(date, 1))}
        >
          <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}

/** SMT-4: the daily schedule grid, manual moves and the heuristic optimisation proposal. */
export function SmartSchedulingPage() {
  const { t } = useTranslation();
  const fmt = useClinicFormat();
  const toast = useToast();
  const dispatch = useDispatch();
  const reference = useClinicReferenceQuery();
  const slot = reference.data?.slotMinutes ?? DEFAULT_SLOT_MINUTES;

  const [date, setDate] = useState(() => fmt.localDate());
  const [objective, setObjective] = useState<OptimizationObjective>('MIN_WAIT');
  const [pending, setPending] = useState<Record<string, PendingMove>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [moveBlock, setMoveBlock] = useState<RenderBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<FocusTarget | null>(null);
  const [insights, dispatchInsights] = useReducer(insightsReducer, initialInsightsState);

  const dayQuery = useSchedulingDayQuery(
    { date },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const day = dayQuery.data;
  const [validateMove] = useSchedulingValidateMoveMutation();
  const [optimize, optimizeState] = useSchedulingOptimizeMutation();
  const [applyProposal, applyState] = useSchedulingApplyMutation();
  const [undoProposal, undoState] = useSchedulingUndoMutation();
  const [reschedule] = useSchedulingRescheduleMutation();

  const dashboard = useDashboardQuery(undefined, { skip: !day });
  const savings =
    dashboard.data?.insight?.kind === 'OPTIMIZE'
      ? Math.round(dashboard.data.insight.minutesSaved)
      : null;

  const pendingList = useMemo(() => Object.values(pending), [pending]);
  const dirty = pendingList.length > 0;
  useUnsavedGuard(dirty, t('scheduling.leaveConfirm'));

  useEffect(() => {
    dispatchInsights({ type: 'pending', count: pendingList.length });
  }, [pendingList.length]);

  const rows = useMemo(() => (day ? applyPending(day, pending) : []), [day, pending]);
  const phase = insightsPhase(insights);
  const proposal = insights.proposal;

  const originals = useMemo(() => {
    const map = new Map<string, { doctorId: string; startsAt: string }>();
    day?.doctors.forEach((d) =>
      d.blocks.forEach((b) => map.set(b.appointmentId, { doctorId: d.id, startsAt: b.startsAt })),
    );
    return map;
  }, [day]);

  const errorText = useCallback(
    (error: unknown) => {
      const e = asClinicError(error);
      return t(`errors.${e?.code ?? 'INTERNAL_ERROR'}`, {
        defaultValue: e?.message ?? t('scheduling.genericError'),
      });
    },
    [t],
  );

  const handleMove = useCallback(
    async (request: GridMoveRequest) => {
      if (!day) return;
      const { block, doctorId, startMinute } = request;
      const original = originals.get(block.appointmentId);
      if (!original) return;
      const startsAt = zonedToUtcIso(day.date, startMinute, day.timezone);
      setNotice(null);

      // Dropping back on the saved position simply clears the local change.
      if (
        original.doctorId === doctorId &&
        new Date(original.startsAt).getTime() === new Date(startsAt).getTime()
      ) {
        setPending((current) => {
          const next = { ...current };
          delete next[block.appointmentId];
          return next;
        });
        return;
      }

      try {
        const result = await validateMove({
          appointmentId: block.appointmentId,
          doctorId,
          startsAt,
        }).unwrap();
        if (!result.valid) {
          setNotice(
            t(`scheduling.invalid.${reasonTail(result.reasonKey)}`, {
              defaultValue: t('scheduling.invalid.unknown'),
            }),
          );
          return;
        }
        setPending((current) => ({
          ...current,
          [block.appointmentId]: {
            appointmentId: block.appointmentId,
            fromDoctorId: original.doctorId,
            toDoctorId: doctorId,
            fromStartsAt: original.startsAt,
            toStartsAt: startsAt,
            durationMinutes: block.durationMinutes,
            patientName: block.patientName,
          },
        }));
      } catch (error) {
        setNotice(errorText(error));
      }
    },
    [day, originals, validateMove, t, errorText],
  );

  const closeMove = useCallback(() => setMoveBlock(null), []);

  const confirmMove = useCallback(
    (block: RenderBlock, doctorId: string, startMinute: number) => {
      setMoveBlock(null);
      void handleMove({ block, doctorId, startMinute });
    },
    [handleMove],
  );

  const changeDate = (next: string) => {
    if (!next || next === date) return;
    if (dirty && !window.confirm(t('scheduling.leaveConfirm'))) return;
    setPending({});
    setNotice(null);
    dispatchInsights({ type: 'reset' });
    setDate(next);
  };

  const run = useCallback(async () => {
    try {
      const result = await optimize({ date, objective }).unwrap();
      dispatchInsights({ type: 'optimized', proposal: result });
    } catch (error) {
      toast.error(errorText(error));
    }
  }, [optimize, date, objective, toast, errorText]);

  const regenerate = useCallback(async () => {
    await dayQuery.refetch();
    await run();
  }, [dayQuery, run]);

  const apply = async () => {
    if (!proposal) return;
    try {
      const result: OptimizationProposal = await applyProposal(proposal.id).unwrap();
      dispatchInsights({ type: 'applied', proposal: result });
      toast.success(t('scheduling.toast.applied'));
    } catch (error) {
      if (asClinicError(error)?.code === 'STALE_PROPOSAL') {
        dispatchInsights({ type: 'stale' });
      } else {
        toast.error(errorText(error));
      }
    }
  };

  const undo = async () => {
    if (!proposal) return;
    try {
      await undoProposal(proposal.id).unwrap();
      dispatchInsights({ type: 'undone' });
      toast.success(t('scheduling.toast.undone'));
    } catch (error) {
      if (asClinicError(error)?.code === 'UNDO_EXPIRED') dispatchInsights({ type: 'undone' });
      toast.error(errorText(error));
    }
  };

  const save = async () => {
    setSaving(true);
    const failures: string[] = [];
    let saved = 0;
    for (const change of Object.values(pending)) {
      try {
        await reschedule({
          id: change.appointmentId,
          changes: { doctorId: change.toDoctorId, startsAt: change.toStartsAt },
        }).unwrap();
        saved += 1;
        setPending((current) => {
          const next = { ...current };
          delete next[change.appointmentId];
          return next;
        });
      } catch (error) {
        failures.push(`${change.patientName}: ${errorText(error)}`);
      }
    }
    dispatch(clinicApi.util.invalidateTags(['Schedule', 'Appointment', 'Dashboard']));
    setSaving(false);
    if (saved > 0) toast.success(t('scheduling.toast.saved', { count: saved }));
    if (failures.length > 0) setNotice(failures.join(' · '));
  };

  const discard = () => {
    setPending({});
    setNotice(null);
  };

  // Ghost blocks of the proposal while previewing.
  const ghosts = insights.preview && proposal ? proposal.moves : [];

  const idleDoctors: IdleDoctor[] = useMemo(() => {
    if (!day) return [];
    return day.metrics.perDoctor
      .filter((m) => m.freeMinutes > 0)
      .sort((a, b) => b.freeMinutes - a.freeMinutes)
      .slice(0, 3)
      .map((m) => ({
        doctorId: m.doctorId,
        name: day.doctors.find((d) => d.id === m.doctorId)?.name ?? '',
        freeMinutes: m.freeMinutes,
      }));
  }, [day]);

  const totals = day?.metrics.totals;
  const dateLabel = (() => {
    if (!date) return '';
    const at = zonedToUtcIso(date, 12 * 60, fmt.timeZone);
    return `${fmt.weekday(at)}, ${fmt.shortDate(at)}`;
  })();

  const focusRow = useCallback((target: FocusTarget) => {
    setHighlight(target);
    focusTarget(target);
  }, []);
  useEffect(() => {
    if (!highlight) return undefined;
    const id = window.setTimeout(() => setHighlight(null), 3000);
    return () => window.clearTimeout(id);
  }, [highlight]);

  return (
    <div>
      <PageHeader
        eyebrow={t('scheduling.eyebrow')}
        title={t('scheduling.title')}
        subtitle={t('scheduling.subtitle')}
        actions={
          <Button
            onClick={() => void run()}
            disabled={optimizeState.isLoading || !day || dirty}
            title={dirty ? t('scheduling.runBlocked') : undefined}
          >
            <Zap size={16} aria-hidden="true" />
            {optimizeState.isLoading ? t('scheduling.running') : t('scheduling.run')}
          </Button>
        }
      />

      <section
        aria-label={t('scheduling.controls')}
        className="mb-6 flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 shadow-(--shadow-card) md:flex-row md:items-center md:justify-between"
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:flex md:items-center">
          <DateNav
            date={date}
            label={t('scheduling.selectedDate')}
            display={dateLabel}
            onChange={changeDate}
          />
          <Metric
            className="md:first:border-s-0"
            label={t('scheduling.utilisation')}
            value={totals ? `${fmt.number(Math.round(totals.utilisation))}%` : '—'}
          />
          <Metric
            label={t('scheduling.estimatedWait')}
            value={
              totals ? t('clinic.minutes', { count: Math.round(totals.estimatedWaitMinutes) }) : '—'
            }
          />
          <Metric
            className="md:hidden"
            label={t('scheduling.demand')}
            value={totals ? fmt.number(totals.appointments) : '—'}
          />
        </div>
        <div className="w-full md:w-64">
          <label htmlFor="sched-objective" className="mb-1.5 block text-xs text-muted">
            {t('scheduling.objective')}
          </label>
          <Select
            id="sched-objective"
            value={objective}
            onChange={(e) => {
              setObjective(e.target.value as OptimizationObjective);
              dispatchInsights({ type: 'reset' });
            }}
          >
            {OPTIMIZATION_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {t(`scheduling.objectives.${OBJECTIVE_KEYS[o]}`)}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {dirty && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} aria-hidden="true" />
            {t('scheduling.unsavedBanner', { count: pendingList.length })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={discard} disabled={saving}>
              <RotateCcw size={14} aria-hidden="true" />
              {t('scheduling.discard')}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              <Save size={14} aria-hidden="true" />
              {t('scheduling.saveManual')}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <strong>{t('scheduling.invalid.heading')}</strong> {notice}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('clinic.close')}
            className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-error/10"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,72fr)_minmax(0,28fr)]">
        <section
          aria-label={t('scheduling.grid.title')}
          className="min-w-0 rounded-lg border border-border bg-surface shadow-(--shadow-card)"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-text">{t('scheduling.grid.title')}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <span aria-hidden="true" className="size-2 rounded-full bg-success" />
              {t('scheduling.grid.live')}
            </span>
          </div>
          {dayQuery.isLoading && (
            <div className="space-y-3 p-5" aria-busy="true">
              <Skeleton className="h-9" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          )}
          {dayQuery.isError && !day && (
            <div className="p-5">
              <ErrorState
                title={t('scheduling.loadError')}
                description={errorText(dayQuery.error)}
                action={
                  <Button variant="secondary" onClick={() => void dayQuery.refetch()}>
                    {t('clinic.retry')}
                  </Button>
                }
              />
            </div>
          )}
          {day && day.doctors.length === 0 && <EmptyState title={t('scheduling.noDoctors')} />}
          {day && day.doctors.length > 0 && (
            <>
              <div className="hidden md:block">
                <ScheduleGrid
                  day={day}
                  rows={rows}
                  slot={slot}
                  ghosts={ghosts}
                  time={fmt.time}
                  highlight={highlight}
                  onMove={(request) => void handleMove(request)}
                  onOpenMove={setMoveBlock}
                />
              </div>
              <div className="md:hidden">
                <MobileScheduleList rows={rows} highlight={highlight} onOpenMove={setMoveBlock} />
              </div>
              <ul className="flex flex-wrap gap-4 border-t border-border px-5 py-3 text-xs text-muted">
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="sched-hatch size-4 rounded-sm border border-border"
                  />
                  {t('scheduling.nonWorking')}
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} aria-hidden="true" className="text-error" />
                  {t('scheduling.conflict')}
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-sm border-2 border-dashed border-primary"
                  />
                  {t('scheduling.unsavedBadge')}
                </li>
              </ul>
            </>
          )}
        </section>

        {day && (
          <InsightsPanel
            phase={phase}
            proposal={proposal}
            objective={objective}
            day={day}
            pending={pendingList}
            idleDoctors={idleDoctors}
            slot={slot}
            savingsMinutes={savings}
            onFocus={focusRow}
            preview={insights.preview}
            applying={applyState.isLoading}
            undoing={undoState.isLoading}
            optimizing={optimizeState.isLoading}
            onPreview={() => dispatchInsights({ type: 'togglePreview' })}
            onApply={() => void apply()}
            onUndo={() => void undo()}
            onRegenerate={() => void regenerate()}
          />
        )}
      </div>

      {day && moveBlock && (
        <MoveDialog
          key={moveBlock.appointmentId}
          block={moveBlock}
          day={day}
          slot={slot}
          onConfirm={confirmMove}
          onClose={closeMove}
        />
      )}
    </div>
  );
}
