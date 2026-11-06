import { useMemo, type CSSProperties } from 'react';
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
import { typeBlockClass } from '../shared/StatusBadge';
import {
  PX_PER_MINUTE,
  ROW_HEIGHT,
  durationToPercent,
  formatMinute,
  hourTicks,
  localMinutes,
  minuteToPercent,
  minutesToDeltaX,
  nonWorkingSegments,
  resolveDrop,
  type RenderBlock,
  type RenderRow,
} from './gridMath';
import './scheduling.css';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

const DOCTOR_COLUMN = 192;

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

function BlockView({
  block,
  rowIndex,
  day,
  moved,
  onOpenMove,
}: {
  block: RenderBlock;
  rowIndex: number;
  day: SchedulingDay;
  moved: boolean;
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
  const range = `${formatMinute(block.startMinute)}–${formatMinute(block.startMinute + block.durationMinutes)}`;
  const label = `${block.patientName}, ${range}, ${t(`clinic.type.${block.type}`)}`;

  return (
    <div
      ref={setNodeRef}
      style={{
        insetInlineStart: `${left}%`,
        inlineSize: `${width}%`,
        top: 6,
        bottom: 6,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 40 : 10,
      }}
      className={`sched-block absolute min-w-0 overflow-hidden rounded-md border text-xs ${typeBlockClass(block.type)} ${
        block.pending ? 'border-2 border-dashed border-primary' : ''
      } ${block.conflict ? 'ring-2 ring-error' : ''} ${moved ? 'opacity-50' : ''} ${
        isDragging ? 'sched-block-dragging' : ''
      }`}
      data-testid={`block-${block.appointmentId}`}
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
        className={`h-full min-w-0 px-2 py-1 pe-7 ${
          block.movable ? 'cursor-grab touch-none active:cursor-grabbing' : ''
        }`}
        tabIndex={0}
      >
        <p className="truncate font-semibold text-text">{block.patientName}</p>
        <p className="truncate text-[11px] opacity-90">
          <bdi dir="ltr">{range}</bdi> · {t(`clinic.type.${block.type}`)}
        </p>
        {block.conflict && (
          <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-error">
            <AlertTriangle size={11} aria-hidden="true" />
            {t('scheduling.conflict')}
          </p>
        )}
        {block.pending && (
          <p className="truncate text-[11px] font-semibold text-primary">
            {t('scheduling.unsavedBadge')}
          </p>
        )}
      </div>
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
}: {
  move: ProposalMove;
  day: SchedulingDay;
  time: (iso: string) => string;
}) {
  const start = localMinutes(move.toStartsAt, day.timezone);
  const left = minuteToPercent(start, day.dayStartMinute, day.dayEndMinute);
  const width = durationToPercent(move.durationMinutes, day.dayStartMinute, day.dayEndMinute);
  return (
    <div
      data-testid={`ghost-${move.appointmentId}`}
      style={{
        insetInlineStart: `${left}%`,
        inlineSize: `${width}%`,
        top: 6,
        bottom: 6,
        zIndex: 20,
      }}
      className="pointer-events-none absolute min-w-0 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/10 px-2 py-1 text-xs text-primary-dark"
    >
      <p className="truncate font-semibold">{move.patientName}</p>
      <p className="flex items-center gap-1 truncate text-[11px]">
        <ArrowRight size={11} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
        <span dir="ltr">{time(move.fromStartsAt)}</span>
        <ArrowRight size={11} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
        <span dir="ltr">{time(move.toStartsAt)}</span>
      </p>
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
  onMove,
  onOpenMove,
}: {
  day: SchedulingDay;
  rows: RenderRow[];
  slot: number;
  ghosts: ProposalMove[];
  time: (iso: string) => string;
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
            <div className="relative h-9 shrink-0" style={{ width: timelinePx }}>
              {ticks.map((tick) => (
                <span
                  key={tick}
                  style={{
                    insetInlineStart: `${minuteToPercent(tick, day.dayStartMinute, day.dayEndMinute)}%`,
                  }}
                  className={`absolute top-2 text-xs text-muted ${
                    tick === day.dayStartMinute ? 'ps-1' : '-translate-x-1/2 rtl:translate-x-1/2'
                  }`}
                >
                  {/* dir on the text only: on the positioned span it would turn inset-inline-start into left. */}
                  <bdi dir="ltr">{formatMinute(tick)}</bdi>
                </span>
              ))}
            </div>
          </div>
          {rows.map((row, rowIndex) => {
            const segments = nonWorkingSegments(
              row.doctor,
              day.timezone,
              day.dayStartMinute,
              day.dayEndMinute,
            );
            return (
              <div
                key={row.doctor.id}
                className="flex border-b border-border last:border-b-0"
                style={{ height: ROW_HEIGHT }}
                data-testid={`row-${row.doctor.id}`}
              >
                <div
                  style={{ width: DOCTOR_COLUMN }}
                  className="sticky start-0 z-30 flex shrink-0 items-center gap-3 border-e border-border bg-surface px-3"
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
                      onOpenMove={onOpenMove}
                    />
                  ))}
                  {ghosts
                    .filter((g) => g.toDoctorId === row.doctor.id)
                    .map((g) => (
                      <GhostView key={g.appointmentId} move={g} day={day} time={time} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
