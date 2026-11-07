import type { PortalAppointment } from '@riaya/shared';

/** Statuses a patient can still change (the API checks again, with the clinic's notice period). */
const OPEN_STATUSES = new Set(['SCHEDULED', 'CONFIRMED']);

export type ChangeGate = 'allowed' | 'closed' | 'tooLate';

/**
 * `canChange` from the API is authoritative (status and notice period). When it is false the
 * UI explains why instead of silently hiding the buttons: "closed" once the visit is over or
 * cancelled, "tooLate" when the clinic's notice window has passed.
 */
export function changeGate(
  appointment: Pick<PortalAppointment, 'canChange' | 'status'>,
): ChangeGate {
  if (!OPEN_STATUSES.has(appointment.status)) return 'closed';
  return appointment.canChange ? 'allowed' : 'tooLate';
}

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'CONFIRMED':
    case 'COMPLETED':
      return 'success';
    case 'SCHEDULED':
    case 'CHECKED_IN':
    case 'IN_PROGRESS':
      return 'info';
    case 'CANCELLED':
      return 'error';
    case 'NO_SHOW':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** The patient's next visit: earliest not-yet-finished appointment that is not cancelled. */
export function pickNext(
  list: PortalAppointment[],
  now: Date = new Date(),
): PortalAppointment | null {
  return (
    [...list]
      .filter((a) => a.status !== 'CANCELLED' && new Date(a.endsAt).getTime() > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
  );
}
