/**
 * The event contract is shared, not re-declared (FR-010, AC-014).
 *
 * These tests import the schema from `@riaya/shared` - the same import the
 * relay uses - so a producer that adopts this package is validating against
 * exactly what the service validates at runtime.
 */
import {
  REALTIME_CONTRACT_VERSION,
  REALTIME_EVENTS_CHANNEL,
  REALTIME_EVENT_NAMES,
  realtimeEventSchema,
} from '@riaya/shared';

const base = () => ({
  contractVersion: REALTIME_CONTRACT_VERSION,
  clinicId: 'clinic-1',
  occurredAt: '2026-11-04T10:00:00.000Z',
});

const appointmentCreated = () => ({
  event: 'appointment.created',
  ...base(),
  payload: {
    appointmentId: 'apt-1',
    doctorId: 'doctor-1',
    startsAt: '2026-11-04T11:00:00.000Z',
    durationMinutes: 30,
    status: 'SCHEDULED',
  },
});

const appointmentCancelled = () => ({
  event: 'appointment.cancelled',
  ...base(),
  payload: {
    appointmentId: 'apt-1',
    cancelledAt: '2026-11-04T10:30:00.000Z',
    reason: 'patient request',
  },
});

const appointmentRescheduled = () => ({
  event: 'appointment.rescheduled',
  ...base(),
  payload: {
    appointmentId: 'apt-1',
    fromStartsAt: '2026-11-04T11:00:00.000Z',
    toStartsAt: '2026-11-04T13:00:00.000Z',
    durationMinutes: 45,
  },
});

const queueUpdated = () => ({
  event: 'queue.updated',
  ...base(),
  payload: { date: '2026-11-04', waiting: 3, inProgress: 1, completed: 12 },
});

describe('realtime event contract', () => {
  // TEST-014 → AC-014
  it('AC-014: every contract event declares its required fields', () => {
    const events = [
      appointmentCreated(),
      appointmentCancelled(),
      appointmentRescheduled(),
      queueUpdated(),
    ];

    for (const event of events) {
      const parsed = realtimeEventSchema.safeParse(event);

      // Each name is asserted individually so a failure names the event.
      expect({ event: event.event, valid: parsed.success }).toEqual({
        event: event.event,
        valid: true,
      });
    }

    expect(REALTIME_EVENT_NAMES).toEqual([
      'appointment.created',
      'appointment.cancelled',
      'appointment.rescheduled',
      'queue.updated',
    ]);
  });

  // TEST-014 → AC-014
  it('AC-014: the contract version is pinned, so a silent producer bump is rejected', () => {
    const bumped = { ...appointmentCreated(), contractVersion: 2 };

    expect(realtimeEventSchema.safeParse(bumped).success).toBe(false);
  });

  // TEST-014 → AC-014
  it('AC-014: an event missing a required field is rejected', () => {
    const incomplete = appointmentCreated();
    delete (incomplete.payload as Partial<typeof incomplete.payload>).doctorId;

    expect(realtimeEventSchema.safeParse(incomplete).success).toBe(false);
  });

  // TEST-014 → AC-014
  it('AC-014: an unknown field is rejected rather than ignored', () => {
    const extra = { ...queueUpdated(), unauthorised: true } as Record<string, unknown>;

    expect(realtimeEventSchema.safeParse(extra).success).toBe(false);
  });

  // TEST-014 → AC-014
  it('AC-014: the wire channel is the one the relay subscribes to', () => {
    expect(REALTIME_EVENTS_CHANNEL).toBe('riaya:events');
  });
});
