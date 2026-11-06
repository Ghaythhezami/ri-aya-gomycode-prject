import { APPOINTMENT_TRANSITIONS, can } from '@riaya/shared';
import type { AppointmentStatus } from '@riaya/shared';

export type RowAction =
  | { kind: 'status'; to: AppointmentStatus; labelKey: string }
  | { kind: 'cancel'; labelKey: string }
  | { kind: 'reschedule'; labelKey: string };

const STATUS_LABEL: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: 'confirm',
  CHECKED_IN: 'checkIn',
  IN_PROGRESS: 'start',
  COMPLETED: 'complete',
  NO_SHOW: 'noShow',
};

/**
 * Actions a role can run on an appointment in a given status (APP-1).
 *
 * Only transitions of the state machine are offered. Front desk and admins manage
 * every appointment; a doctor may change the status of their own (the API only
 * returns those) but cannot cancel or reschedule.
 */
export function allowedActions(
  role: string | null | undefined,
  status: AppointmentStatus,
  transitions: readonly AppointmentStatus[] = APPOINTMENT_TRANSITIONS[status],
  /** The caller's effective `manageAppointments` (custom roles); defaults to the role matrix. */
  canManage?: boolean,
): RowAction[] {
  const manage = canManage ?? can(role, 'manageAppointments');
  const doctor = role === 'DOCTOR';
  if (!manage && !doctor) return [];

  const actions: RowAction[] = [];
  for (const to of transitions) {
    const labelKey = STATUS_LABEL[to];
    if (labelKey) actions.push({ kind: 'status', to, labelKey });
  }
  if (manage && (status === 'SCHEDULED' || status === 'CONFIRMED')) {
    actions.push({ kind: 'reschedule', labelKey: 'reschedule' });
  }
  if (manage && transitions.includes('CANCELLED')) {
    actions.push({ kind: 'cancel', labelKey: 'cancel' });
  }
  return actions;
}

export function canBulkConfirm(status: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[status].includes('CONFIRMED');
}

export function canBulkCancel(status: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[status].includes('CANCELLED');
}

/** "Change type": managers only, SCHEDULED/CONFIRMED and still in the future. */
export function canChangeAppointmentType(
  manage: boolean,
  status: AppointmentStatus,
  startsAt: string,
  now: number = Date.now(),
): boolean {
  return manage && (status === 'SCHEDULED' || status === 'CONFIRMED') && Date.parse(startsAt) > now;
}
