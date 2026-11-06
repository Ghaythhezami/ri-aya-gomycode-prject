import type { AppointmentListItem, AppointmentStatus } from '@riaya/shared';

const DONE: readonly AppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export interface ScheduleMarkers {
  /** Appointment to highlight: the one in progress, else the next upcoming. */
  highlightId: string | null;
  /** Index the "Now" marker row is inserted before (items.length = after the last). */
  nowIndex: number;
}

/**
 * Where the "Now" marker goes in today's schedule and which row is highlighted.
 * `items` are sorted by start time. The marker sits before the first appointment
 * that has not started yet; an appointment that is in progress (or overdue and not
 * finished) is the highlight, otherwise the next one that is still open.
 */
export function scheduleMarkers(
  items: readonly AppointmentListItem[],
  now: number,
): ScheduleMarkers {
  let nowIndex = items.length;
  for (let index = 0; index < items.length; index += 1) {
    if (new Date(items[index]!.startsAt).getTime() > now) {
      nowIndex = index;
      break;
    }
  }

  const current = items.find(
    (item) =>
      item.status === 'IN_PROGRESS' ||
      (!DONE.includes(item.status) &&
        new Date(item.startsAt).getTime() <= now &&
        new Date(item.endsAt).getTime() > now),
  );
  if (current) return { highlightId: current.id, nowIndex };

  const upcoming = items.find(
    (item) => !DONE.includes(item.status) && new Date(item.startsAt).getTime() > now,
  );
  return { highlightId: upcoming?.id ?? null, nowIndex };
}

/** "10 min ago" style label from an ISO instant, in the UI locale. */
export function relativeTime(at: string | null, now: number, locale: string): string {
  if (!at) return '';
  const seconds = Math.round((new Date(at).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
    numeric: 'auto',
    style: 'short',
  });
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(0, 'minute');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  return formatter.format(Math.round(seconds / 86400), 'day');
}

/** Sign-prefixed whole percentage, e.g. "+12" / "-40". */
export function signed(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
