import type { GridBlock, SchedulingDay } from '@riaya/shared';

/** Horizontal scale of the daily grid: pixels per minute of clinic time. */
export const PX_PER_MINUTE = 4;
/** Height of one doctor row in pixels (drag snaps to rows of this height). */
export const ROW_HEIGHT = 80;
export const DEFAULT_SLOT_MINUTES = 15;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Position of a minute-of-day on the grid, as a percentage of the day span (0..100). */
export function minuteToPercent(minute: number, dayStart: number, dayEnd: number): number {
  const span = dayEnd - dayStart;
  if (span <= 0) return 0;
  return clamp(((minute - dayStart) / span) * 100, 0, 100);
}

/** Width of a duration as a percentage of the day span. */
export function durationToPercent(minutes: number, dayStart: number, dayEnd: number): number {
  const span = dayEnd - dayStart;
  if (span <= 0) return 0;
  return clamp((minutes / span) * 100, 0, 100);
}

/** Pixel offset from the start of the timeline. */
export function minuteToPx(minute: number, dayStart: number, pxPerMinute = PX_PER_MINUTE): number {
  return (minute - dayStart) * pxPerMinute;
}

/** Snap a minute-of-day to the slot grid. */
export function snapMinute(minute: number, step: number): number {
  if (step <= 0) return Math.round(minute);
  return Math.round(minute / step) * step;
}

/**
 * Horizontal drag distance (physical pixels) to minutes. In a right-to-left layout the
 * timeline runs towards the left, so a physical shift to the left is later in the day.
 */
export function deltaXToMinutes(dx: number, pxPerMinute: number, rtl: boolean): number {
  const minutes = dx / pxPerMinute;
  return rtl ? -minutes : minutes;
}

/** Inverse of {@link deltaXToMinutes}: the physical pixel step for a number of minutes. */
export function minutesToDeltaX(minutes: number, pxPerMinute: number, rtl: boolean): number {
  const px = minutes * pxPerMinute;
  return rtl ? -px : px;
}

/** Row the block lands in after a vertical drag of `dy` pixels. */
export function rowIndexAfterDrag(
  startIndex: number,
  dy: number,
  rowHeight: number,
  rowCount: number,
): number {
  return clamp(startIndex + Math.round(dy / rowHeight), 0, Math.max(rowCount - 1, 0));
}

/** Keep a block of `duration` minutes inside the day bounds. */
export function clampStart(
  start: number,
  duration: number,
  dayStart: number,
  dayEnd: number,
): number {
  return clamp(start, dayStart, Math.max(dayStart, dayEnd - duration));
}

export interface DropInput {
  startMinute: number;
  duration: number;
  rowIndex: number;
  dx: number;
  dy: number;
  pxPerMinute?: number;
  rowHeight?: number;
  rowCount: number;
  dayStart: number;
  dayEnd: number;
  slot: number;
  rtl: boolean;
}

/** Resolve a drag delta into the target row and snapped, clamped start minute. */
export function resolveDrop(input: DropInput): { rowIndex: number; startMinute: number } {
  const pxPerMinute = input.pxPerMinute ?? PX_PER_MINUTE;
  const rowHeight = input.rowHeight ?? ROW_HEIGHT;
  const raw = input.startMinute + deltaXToMinutes(input.dx, pxPerMinute, input.rtl);
  const snapped = snapMinute(raw, input.slot);
  return {
    rowIndex: rowIndexAfterDrag(input.rowIndex, input.dy, rowHeight, input.rowCount),
    startMinute: clampStart(snapped, input.duration, input.dayStart, input.dayEnd),
  };
}

/** Tick minutes between the day bounds (hourly by default). */
export function hourTicks(dayStart: number, dayEnd: number, step = 60): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(dayStart / step) * step;
  for (let minute = first; minute <= dayEnd; minute += step) ticks.push(minute);
  return ticks;
}

/** "09:05" for a minute-of-day (24 h, Latin digits so the grid stays readable in RTL). */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function zoneParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** Local minute-of-day of an instant in the clinic zone. */
export function localMinutes(iso: string, timeZone: string): number {
  const p = zoneParts(new Date(iso).getTime(), timeZone);
  return p.hour * 60 + p.minute;
}

/** ISO UTC instant for a local `YYYY-MM-DD` date and minute-of-day in `timeZone`. */
export function zonedToUtcIso(date: string, minute: number, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const wanted = Date.UTC(y, mo - 1, d, 0, minute);
  let guess = wanted;
  // Two passes settle the offset, including across a daylight-saving change.
  for (let i = 0; i < 2; i += 1) {
    const p = zoneParts(guess, timeZone);
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - got;
  }
  return new Date(guess).toISOString();
}

export interface Segment {
  startMinute: number;
  endMinute: number;
  kind: 'off' | 'break';
}

/** Non-working time of a doctor row: the day minus work intervals, plus breaks. */
export function nonWorkingSegments(
  doctor: Pick<SchedulingDay['doctors'][number], 'work' | 'breaks'>,
  timeZone: string,
  dayStart: number,
  dayEnd: number,
): Segment[] {
  const toRange = (r: { startsAt: string; endsAt: string }) => {
    const end = localMinutes(r.endsAt, timeZone);
    return {
      start: clamp(localMinutes(r.startsAt, timeZone), dayStart, dayEnd),
      // An interval ending at local midnight reads as 0; it means the end of the day.
      end: clamp(end === 0 ? dayEnd : end, dayStart, dayEnd),
    };
  };
  const work = doctor.work
    .map(toRange)
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = dayStart;
  for (const r of work) {
    if (r.start > cursor) segments.push({ startMinute: cursor, endMinute: r.start, kind: 'off' });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < dayEnd) segments.push({ startMinute: cursor, endMinute: dayEnd, kind: 'off' });
  for (const b of doctor.breaks) {
    const r = toRange(b);
    if (r.end > r.start) segments.push({ startMinute: r.start, endMinute: r.end, kind: 'break' });
  }
  return segments;
}

export interface PendingMove {
  appointmentId: string;
  fromDoctorId: string;
  toDoctorId: string;
  fromStartsAt: string;
  toStartsAt: string;
  durationMinutes: number;
  patientName: string;
}

export interface RenderBlock extends GridBlock {
  doctorId: string;
  startMinute: number;
  durationMinutes: number;
  pending: boolean;
}

export interface RenderRow {
  doctor: SchedulingDay['doctors'][number];
  blocks: RenderBlock[];
}

/** Rows of the grid with local (unsaved) moves applied on top of the server schedule. */
export function applyPending(
  day: SchedulingDay,
  pending: Record<string, PendingMove>,
): RenderRow[] {
  const rows: RenderRow[] = day.doctors.map((doctor) => ({ doctor, blocks: [] }));
  const byId = new Map(rows.map((row) => [row.doctor.id, row]));
  for (const doctor of day.doctors) {
    for (const block of doctor.blocks) {
      const move = pending[block.appointmentId];
      const targetId = move ? move.toDoctorId : doctor.id;
      const startsAt = move ? move.toStartsAt : block.startsAt;
      const duration = move
        ? move.durationMinutes
        : Math.round(
            (new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60000,
          );
      const target = byId.get(targetId) ?? byId.get(doctor.id);
      target?.blocks.push({
        ...block,
        startsAt,
        endsAt: new Date(new Date(startsAt).getTime() + duration * 60000).toISOString(),
        doctorId: target?.doctor.id ?? doctor.id,
        startMinute: localMinutes(startsAt, day.timezone),
        durationMinutes: duration,
        pending: Boolean(move),
      });
    }
  }
  for (const row of rows) row.blocks.sort((a, b) => a.startMinute - b.startMinute);
  return rows;
}

/** Seconds left until `until` (never negative), for the undo countdown. */
export function secondsRemaining(until: string | null, now: number): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
}
