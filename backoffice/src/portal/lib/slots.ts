import type { PortalSlot } from '@riaya/shared';

/** Clinic-time-zone date maths for the booking calendar. Dates are `YYYY-MM-DD` strings. */

export function safeZone(timeZone: string | null | undefined): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (!timeZone) return fallback;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    return fallback;
  }
}

/** Calendar date of an instant in the clinic zone. */
export function dateInZone(value: Date | string | number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

/** Hour (0-23) of an instant in the clinic zone. */
export function hourInZone(value: Date | string | number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeZone(timeZone),
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

/** Adds whole calendar days; pure date arithmetic (no zone, no DST drift). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `count` consecutive clinic-local days starting today. */
export function dateStrip(timeZone: string, count: number, now: Date = new Date()): string[] {
  const today = dateInZone(now, timeZone);
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

export function isPastDate(ymd: string, timeZone: string, now: Date = new Date()): boolean {
  return ymd < dateInZone(now, timeZone);
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPartOf(startsAt: string, timeZone: string): DayPart {
  const hour = hourInZone(startsAt, timeZone);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Future slots only, ordered, grouped by part of day in the clinic zone. */
export function groupSlots(
  slots: PortalSlot[],
  timeZone: string,
  now: Date = new Date(),
): Record<DayPart, PortalSlot[]> {
  const groups: Record<DayPart, PortalSlot[]> = { morning: [], afternoon: [], evening: [] };
  [...slots]
    .filter((s) => new Date(s.startsAt).getTime() > now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .forEach((s) => groups[dayPartOf(s.startsAt, timeZone)].push(s));
  return groups;
}

/** Whether a slot belongs to the chosen clinic-local day (guards stale responses). */
export function slotOnDate(slot: PortalSlot, ymd: string, timeZone: string): boolean {
  return dateInZone(slot.startsAt, timeZone) === ymd;
}

export function firstPartWithSlots(groups: Record<DayPart, PortalSlot[]>): DayPart {
  return (
    (['morning', 'afternoon', 'evening'] as const).find((p) => groups[p].length > 0) ?? 'morning'
  );
}
