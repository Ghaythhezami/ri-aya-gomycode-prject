import { ConflictException } from '@nestjs/common';
import { APPOINTMENT_TRANSITIONS, canTransition, type AppointmentStatus } from '@riaya/shared';

/** Statuses after which an appointment can no longer be edited or rescheduled. */
export const TERMINAL_STATUSES: readonly AppointmentStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export function allowedTransitions(from: AppointmentStatus): AppointmentStatus[] {
  return [...(APPOINTMENT_TRANSITIONS[from] ?? [])];
}

export function illegalTransition(from: AppointmentStatus, to: AppointmentStatus) {
  return new ConflictException({
    code: 'ILLEGAL_TRANSITION',
    message: `Cannot move an appointment from ${from} to ${to}`,
    details: { from, to, allowed: allowedTransitions(from) },
  });
}

/** Throws 409 ILLEGAL_TRANSITION unless the state machine allows `from → to`. */
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) throw illegalTransition(from, to);
}

export function isEditable(status: AppointmentStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}
