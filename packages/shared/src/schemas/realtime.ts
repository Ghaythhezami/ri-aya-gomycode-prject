/**
 * Realtime event contract (BP-031, FR-010).
 *
 * This is the wire format for the four domain events the realtime service
 * forwards. It lives here rather than in `realtime/` so a producer (APP-1,
 * QUE-1) validates against the same schema the relay does - if the two ever
 * disagree, the relay drops the event (FR-009) and nothing tells the producer.
 *
 * Rules this module keeps, per .sdrive/skills/zod:
 * - One schema per contract, exported from `@riaya/shared` only.
 * - No side effects: zod and sibling modules only.
 * - Types are inferred, never re-declared.
 */
import { z } from 'zod';

/**
 * The channel every producer publishes to. Named here so the producer and the
 * relay cannot drift on a string literal (FR-008).
 */
export const REALTIME_EVENTS_CHANNEL = 'riaya:events';

/**
 * Bumped deliberately when a payload shape changes. A producer that ships a
 * new version without this file changing fails validation at the relay rather
 * than being silently accepted (AC-012).
 */
export const REALTIME_CONTRACT_VERSION = 1;

/** ISO 8601 instant. Validated as a date, not accepted as free text. */
const instant = z.iso.datetime();

/** `appointment.created` - a new appointment exists in a clinic. */
export const appointmentCreatedPayloadSchema = z
  .object({
    appointmentId: z.string().min(1).max(64),
    doctorId: z.string().min(1).max(64),
    startsAt: instant,
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    status: z.enum(['SCHEDULED', 'CONFIRMED']),
  })
  .strict();

/** `appointment.cancelled` - an appointment was cancelled. */
export const appointmentCancelledPayloadSchema = z
  .object({
    appointmentId: z.string().min(1).max(64),
    cancelledAt: instant,
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();

/** `appointment.rescheduled` - an appointment moved to a new start. */
export const appointmentRescheduledPayloadSchema = z
  .object({
    appointmentId: z.string().min(1).max(64),
    fromStartsAt: instant,
    toStartsAt: instant,
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
  })
  .strict();

/** `queue.updated` - one day's queue counts for a clinic. */
export const queueUpdatedPayloadSchema = z
  .object({
    date: z.iso.date(),
    waiting: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  })
  .strict();

/** Every event name the relay will forward. */
export const REALTIME_EVENT_NAMES = [
  'appointment.created',
  'appointment.cancelled',
  'appointment.rescheduled',
  'queue.updated',
] as const;

const envelopeBase = {
  contractVersion: z.literal(REALTIME_CONTRACT_VERSION),
  clinicId: z.string().min(1).max(64),
  occurredAt: instant,
};

/**
 * The envelope plus its payload, discriminated on `event`. A discriminated
 * union is what lets the relay forward the envelope unchanged (AC-011) while
 * still validating the payload that matches the name it carries.
 */
export const realtimeEventSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('appointment.created'),
      ...envelopeBase,
      payload: appointmentCreatedPayloadSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal('appointment.cancelled'),
      ...envelopeBase,
      payload: appointmentCancelledPayloadSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal('appointment.rescheduled'),
      ...envelopeBase,
      payload: appointmentRescheduledPayloadSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal('queue.updated'),
      ...envelopeBase,
      payload: queueUpdatedPayloadSchema,
    })
    .strict(),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventName = RealtimeEvent['event'];
