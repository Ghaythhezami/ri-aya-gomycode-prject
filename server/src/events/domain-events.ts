/**
 * In-process domain events (RT-1). Producers (appointments, queue, scheduling)
 * emit AFTER their transaction commits; consumers (notifications, reminders,
 * metrics cache, realtime relay) subscribe. Producers never import consumers.
 */
export type DomainEventType =
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.rescheduled'
  | 'appointment.cancelled'
  | 'appointment.status_changed'
  | 'queue.updated'
  | 'schedule.optimized'
  | 'patient.created'
  | 'doctor.availability_changed'
  | 'settings.updated';

export interface DomainEvent {
  type: DomainEventType;
  clinicId: string;
  organizationId: string | null;
  actorUserId: string | null;
  occurredAt: Date;
  /** Event-specific data; see the emitters. Common keys: appointmentId, doctorId, startsAt, date. */
  payload: Record<string, unknown>;
}
