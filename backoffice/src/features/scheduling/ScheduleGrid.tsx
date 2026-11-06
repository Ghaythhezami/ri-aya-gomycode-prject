import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { AlertTriangle, ArrowRight, MoreVertical } from 'lucide-react';
import type { ProposalMove, SchedulingDay } from '@riaya/shared';
import { Avatar } from '../shared/Avatar';
import {
  PX_PER_MINUTE,
  ROW_HEIGHT,
  blockAccent,
  durationToPercent,
  formatMinute,
  hourTicks,
  localMinutes,
  minuteToPercent,
  minutesToDeltaX,
  nonWorkingSegments,
  nowMinute,
  resolveDrop,
  type RenderBlock,
  type RenderRow,
} from './gridMath';
import './scheduling.css';
import type { FocusTarget } from './focusTarget';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

const DOCTOR_COLUMN = 208;

interface DragData {
  rowIndex: number;
  startMinute: number;
  duration: number;
  name: string;
}

export interface GridMoveRequest {
  block: RenderBlock;
  doctorId: string;
  startMinute: number;
}

/** Soft fill of an appointment block in its type colour. */
function tint(accent: string): string {
  return `color-mix(in srgb, ${accent} 12%, var(--color-surface))`;
}

function BlockView({
  block,
  rowIndex,
  day,
  moved,
  highlighted,
  onOpenMove,
}: {
  block: RenderBlock;
  rowIndex: number;
  day: SchedulingDay;
  moved: boolean;
  highlighted: boolean;
  onOpenMove: (block: RenderBlock) => void;
}) {
  const { t } = useTranslation();
  const data: DragData = {
    rowIndex,
    startMinute: block.startMinute,
    duration: block.durationMinutes,
    name: block.patientName,
  };
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.appointmentId,
    disabled: !block.movable,
    data,
  });
  const left = minuteToPercent(block.startMinute, day.dayStartMinute, day.dayEndMinute);
  const width = durationToPercent(block.durationMinutes, day.dayStartMinute, day.dayEndMinute);
  const start = formatMinute(block.startMinute);
  const range = `${start}–${formatMinute(block.startMinute + block.durationMinutes)}`;
  const typeLabel = block.typeName || t(`clinic.type.${block.type}`);
  const accent = blockAccent(block);
  const label = `${block.patientName}, ${range}, ${typeLabel}${
    block.conflict ? `, ${t('scheduling.conflict')}` : ''
  }`;

  return (
    <div
      ref={setNodeRef}
      style={{
        insetInlineStart: `${left}%`,
        inlineSize: `${width}%`,
        top: 8,
        bottom: 8,
        borderInlineStartColor: moved ? undefined : accent,
        backgroundColor: moved ? 'transparent' : tint(accent),
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 40 : highlighted ? 25 : 10,
      }}
      className={`sched-block absolute min-w-0 overflow-hidden rounded-md border border-s-[3px] text-xs ${
        moved ? 'border-dashed border-border-strong' : 'border-border'
      } ${block.pending ? 'border-2 border-dashed border-primary' : ''} ${
        block.conflict ? 'ring-2 ring-error' : ''
      } ${highlighted ? 'ring-2 ring-primary' : ''} ${isDragging ? 'sched-block-dragging' : ''}`}
      data-testid={`block-${block.appointmentId}`}
      data-appt={block.appointmentId}
    >
      <div
        {...(block.movable ? attributes : {})}
        {...(block.movable ? listeners : {})}
        aria-label={label}
        title={label}
        onKeyDown={(event) => {
          if (block.movable && event.key.toLowerCase() === 'm') {
            event.preventDefault();
            onOpenMove(block);
            return;
          }
          if (block.movable) listeners?.onKeyDown?.(event);
        }}
        className={`h-full min-w-0 rounded-md px-2 py-1 pe-7 ${
          block.movable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
        }`}
        tabIndex={0}
      >
        <p className={`truncate font-semibold ${moved ? 'text-muted' : 'text-text'}`}>
          {block.patientName}
        </p>
        <p className="truncate text-[11px] text-muted">
          <bdi dir="ltr">{start}</bdi> · {t('clinic.minutes', { count: block.durationMinutes })}
        </p>
        <p className="truncate text-[11px] text-muted">{typeLabel}</p>
        {block.pending && (
          <p className="truncate text-[11px] font-semibold text-primary">
            {t('scheduling.unsavedBadge')}
          </p>
        )}
      </div>
      {block.conflict && (
        <AlertTriangle
          size={12}
          aria-hidden="true"
          className="pointer-events-none absolute end-1.5 bottom-1.5 text-error"
        />
      )}
      {block.movable && (
        <button
          type="button"
          onClick={() => onOpenMove(block)}
          aria-label={t('scheduling.moveToFor', { name: block.patientName })}
          className="absolute end-0 top-0 grid size-10 place-items-center rounded-md text-muted hover:bg-surface hover:text-text"
        >
          <MoreVertical size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function GhostView({
  move,
  day,
  time,
  source,
}: {
  move: ProposalMove;
  day: SchedulingDay;
  time: (iso: string) => string;
  source: RenderBlock | undefined;
}) {
  const { t } = useTranslation();
  const start = localMinutes(move.toStartsAt, day.timezone);
  const left = minuteToPercent(start, day.dayStartMinute, day.dayEndMinute);
  const width = durationToPercent(move.durationMinutes, day.dayStartMinute, day.dayEndMinute);
  const accent = source ? blockAccent(source) : 'var(--color-primary)';
  return (
    <div
      data-testid={`ghost-${move.appointmentId}`}
      style={{
        insetInlineStart: `${left}%`,
        inlineSize: `${width}%`,
        top: 8,
        bottom: 8,
        zIndex: 20,
        borderInlineStartColor: accent,
        backgroundColor: tint(accent),
      }}
      className="sched-ghost pointer-events-none absolute min-w-0 overflow-hidden rounded-md border border-s-[3px] border-primary px-2 py-1 text-xs shadow-(--shadow-card)"
    >
      <p className="truncate pe-6 font-semibold text-text">{move.patientName}</p>
      <p className="flex items-center gap-1 truncate text-[11px] text-muted">
        <span dir="ltr">{time(move.fromStartsAt)}</span>
        <ArrowRight size={11} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
        <span dir="ltr">{time(move.toStartsAt)}</span>
      </p>
      <span
        title={t('scheduling.proposed')}
        className="absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-white"
      >
        <ArrowRight size={11} aria-hidden="true" className="rtl:-scale-x-100" />
        <span className="sr-only">{t('scheduling.proposed')}</span>
      </span>
    </div>
  );
}

/** Desktop/tablet daily grid: doctors as rows, time as columns, drag and drop on a slot grid. */
export function ScheduleGrid({
  day,
  rows,
  slot,
  ghosts,
  time,
  highlight,
  onMove,
  onOpenMove,
}: {
  day: SchedulingDay;
  rows: RenderRow[];
  slot: number;
  ghosts: ProposalMove[];
  time: (iso: string) => string;
  highlight: FocusTarget | null;
  onMove: (request: GridMoveRequest) => void;
  onOpenMove: (block: RenderBlock) => void;
}) {
  const { t, i18n } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const rtl = i18n.dir() === 'rtl';
  const span = day.dayEndMinute - day.dayStartMinute;
  const timelinePx = span * PX_PER_MINUTE;
  const ticks = hourTicks(day.dayStartMinute, day.dayEndMinute);
  const movedIds = useMemo(() => new Set(ghosts.map((g) => g.appointmentId)), [ghosts]);
  const sources = useMemo(() => {
    const map = new Map<string, RenderBlock>();
    rows.forEach((r) => r.blocks.forEach((b) => map.set(b.appointmentId, b)));
    return map;
  }, [rows]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowMin = nowMinute(day, now);
  const nowPercent =
    nowMin !== null && nowMin >= day.dayStartMinute && nowMin <= day.dayEndMinute
      ? minuteToPercent(nowMin, day.dayStartMinute, day.dayEndMinute)
      : null;

  const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = minutesToDeltaX(slot, PX_PER_MINUTE, false);
    switch (event.code) {
      case 'ArrowRight':
        return { ...currentCoordinates, x: currentCoordinates.x + step };
      case 'ArrowLeft':
        return { ...currentCoordinates, x: currentCoordinates.x - step };
      case 'ArrowDown':
        return { ...currentCoordinates, y: currentCoordinates.y + ROW_HEIGHT };
      case 'ArrowUp':
        return { ...currentCoordinates, y: currentCoordinates.y - ROW_HEIGHT };
      default:
        return undefined;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    const target = resolveDrop({
      startMinute: data.startMinute,
      duration: data.duration,
      rowIndex: data.rowIndex,
      dx: event.delta.x,
      dy: event.delta.y,
      rowCount: rows.length,
      dayStart: day.dayStartMinute,
      dayEnd: day.dayEndMinute,
      slot,
      rtl,
    });
    if (target.rowIndex === data.rowIndex && target.startMinute === data.startMinute) return;
    const row = rows[data.rowIndex];
    const block = row?.blocks.find((b) => b.appointmentId === event.active.id);
    const targetRow = rows[target.rowIndex];
    if (!block || !targetRow) return;
    onMove({ block, doctorId: targetRow.doctor.id, startMinute: target.startMinute });
  };

  const hourW = `${(60 / span) * 100}%`;
  const slotW = `${(slot / span) * 100}%`;

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: t('scheduling.dnd.instructions') },
        announcements: {
          onDragStart: ({ active }) =>
            t('scheduling.dnd.pickedUp', { name: (active.data.current as DragData)?.name }),
          onDragOver: () => undefined,
          onDragEnd: ({ active }) =>
            t('scheduling.dnd.dropped', { name: (active.data.current as DragData)?.name }),
          onDragCancel: ({ active }) =>
            t('scheduling.dnd.cancelled', { name: (active.data.current as DragData)?.name }),
        },
      }}
    >
      <div
        role="region"
        aria-label={t('scheduling.grid.title')}
        tabIndex={0}
        className="overflow-x-auto"
      >
        <div style={{ width: DOCTOR_COLUMN + timelinePx, minWidth: '100%' }}>
          <div className="flex border-b border-border">
            <div
              style={{ width: DOCTOR_COLUMN }}
              className="sticky start-0 z-30 shrink-0 border-e border-border bg-surface"
            />
            <div className="sched-header relative h-9 shrink-0" style={{ width: timelinePx }}>
              {ticks.map((tick) => (
                <span
                  key={tick}
                  style={{
                    insetInlineStart: `${minuteToPercent(tick, day.dayStartMinute, day.dayEndMinute)}%`,
                  }}
                  className={`absolute top-2 text-xs font-medium text-muted ${
                    tick === day.dayStartMinute ? 'ps-1' : '-translate-x-1/2 rtl:translate-x-1/2'
                  }`}
                >
                  {/* dir on the text only: on the positioned span it would turn inset-inline-start into left. */}
                  <bdi dir="ltr">{formatMinute(tick)}</bdi>
                </span>
              ))}
              {nowPercent !== null && (
                <span
                  style={{ insetInlineStart: `${nowPercent}%` }}
                  className="absolute bottom-0 z-20 -translate-x-1/2 rounded-full bg-error px-1.5 py-px text-[10px] font-semibold leading-4 text-white rtl:translate-x-1/2"
                >
                  {t('scheduling.grid.now')}
                </span>
              )}
            </div>
          </div>
          {rows.map((row, rowIndex) => {
            const segments = nonWorkingSegments(
              row.doctor,
              day.timezone,
              day.dayStartMinute,
              day.dayEndMinute,
            );
            const hasConflict = row.blocks.some((b) => b.conflict);
            const rowHighlighted = highlight?.kind === 'doctor' && highlight.id === row.doctor.id;
            return (
              <div
                key={row.doctor.id}
                className={`flex border-b border-border last:border-b-0 ${
                  rowHighlighted ? 'bg-accent/40' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
                data-testid={`row-${row.doctor.id}`}
                data-row={row.doctor.id}
              >
                <div
                  style={{ width: DOCTOR_COLUMN }}
                  tabIndex={rowHighlighted ? 0 : undefined}
                  className="sticky start-0 z-30 flex shrink-0 items-center gap-3 border-e border-border bg-surface px-4"
                >
                  <Avatar initials={row.doctor.initials} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{row.doctor.name}</p>
                    <p className="truncate text-xs text-muted">
                      {specialtyLabel(row.doctor.specialty)}
                    </p>
                  </div>
                </div>
                <div
                  className="sched-timeline relative shrink-0"
                  style={
                    {
                      width: timelinePx,
                      '--hour-w': hourW,
                      '--slot-w': slotW,
                    } as CSSProperties
                  }
                >
                  {segments.map((segment) => (
                    <div
                      key={`${segment.kind}-${segment.startMinute}`}
                      aria-hidden="true"
                      className={
                        segment.kind === 'break'
                          ? 'sched-hatch-break absolute inset-y-0'
                          : 'sched-hatch absolute inset-y-0'
                      }
                      style={{
                        insetInlineStart: `${minuteToPercent(segment.startMinute, day.dayStartMinute, day.dayEndMinute)}%`,
                        inlineSize: `${durationToPercent(segment.endMinute - segment.startMinute, day.dayStartMinute, day.dayEndMinute)}%`,
                      }}
                      title={
                        segment.kind === 'break'
                          ? t('scheduling.break')
                          : t('scheduling.nonWorking')
                      }
                    />
                  ))}
                  {row.blocks.map((block) => (
                    <BlockView
                      key={block.appointmentId}
                      block={block}
                      rowIndex={rowIndex}
                      day={day}
                      moved={movedIds.has(block.appointmentId)}
                      highlighted={
                        highlight?.kind === 'appointment' && highlight.id === block.appointmentId
                      }
                      onOpenMove={onOpenMove}
                    />
                  ))}
                  {ghosts
                    .filter((g) => g.toDoctorId === row.doctor.id)
                    .map((g) => (
                      <GhostView
                        key={g.appointmentId}
                        move={g}
                        day={day}
                        time={time}
                        source={sources.get(g.appointmentId)}
                      />
                    ))}
                  {nowPercent !== null && (
                    <div
                      aria-hidden="true"
                      style={{ insetInlineStart: `${nowPercent}%` }}
                      className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-error"
                    />
                  )}
                  {hasConflict && (
                    <span className="absolute end-1 top-1 z-30 inline-flex items-center gap-1 rounded-full border border-error bg-surface px-2 py-0.5 text-[11px] font-semibold text-error">
                      <AlertTriangle size={11} aria-hidden="true" />
                      {t('scheduling.conflict')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
