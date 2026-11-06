import type { AppointmentListItem } from '@riaya/shared';
import { zonedParts } from './dates';
import { layoutOverlaps } from './layout';

/** One appointment positioned inside its day column. */
export interface CalBlock {
  item: AppointmentListItem;
  /** Minutes after local midnight (clinic zone). */
  start: number;
  end: number;
  /** Cheap "HH:MM" of the start, so no formatter runs per block. */
  label: string;
  col: number;
  cols: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function minutesLabel(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

/**
 * Groups appointments by clinic-local day and assigns overlap columns once per
 * day. Cancelled appointments stay visible (greyed by the view) so staff see what
 * happened to the slot. Run inside `useMemo`: the cost is one pass over the data.
 */
export function groupByDay(
  items: readonly AppointmentListItem[],
  timeZone: string,
): Map<string, CalBlock[]> {
  const byDay = new Map<string, Omit<CalBlock, 'col' | 'cols'>[]>();

  for (const item of items) {
    const { ymd, minutes } = zonedParts(item.startsAt, timeZone);
    const end = Math.min(1440, minutes + Math.max(item.durationMinutes, 5));
    const list = byDay.get(ymd);
    const entry = { item, start: minutes, end, label: minutesLabel(minutes) };
    if (list) list.push(entry);
    else byDay.set(ymd, [entry]);
  }

  const result = new Map<string, CalBlock[]>();
  for (const [ymd, entries] of byDay) {
    entries.sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id));
    const layout = layoutOverlaps(
      entries.map((e) => ({ id: e.item.id, start: e.start, end: e.end })),
    );
    result.set(
      ymd,
      entries.map((entry) => {
        const slot = layout.get(entry.item.id);
        return { ...entry, col: slot?.col ?? 0, cols: slot?.cols ?? 1 };
      }),
    );
  }
  return result;
}

/** Visible hour range: at least 08:00-18:00, widened to fit every block. */
export function hourRange(days: Iterable<readonly CalBlock[]>): {
  startHour: number;
  endHour: number;
} {
  let startHour = 8;
  let endHour = 18;
  for (const blocks of days) {
    for (const block of blocks) {
      startHour = Math.min(startHour, Math.floor(block.start / 60));
      endHour = Math.max(endHour, Math.ceil(block.end / 60));
    }
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}
