import { z } from 'zod';
import { APPOINTMENT_TYPES } from '@riaya/shared';

/**
 * Booking form model and the per-step validation (APP-3). Messages are i18n keys,
 * translated by `Field` / the step components.
 */
export const STEPS = ['patient', 'doctor', 'datetime', 'details', 'review'] as const;
export type StepId = (typeof STEPS)[number];

const patientRef = z.object({
  id: z.string().min(1),
  name: z.string(),
  code: z.string(),
  initials: z.string(),
  phoneMasked: z.string(),
});

const doctorRef = z.object({
  id: z.string().min(1),
  name: z.string(),
  initials: z.string(),
  specialty: z.string(),
  consultationMinutes: z.number(),
});

export type PatientChoice = z.infer<typeof patientRef>;
export type DoctorChoice = z.infer<typeof doctorRef>;

export interface BookingForm {
  patient: PatientChoice | null;
  doctor: DoctorChoice | null;
  specialty: string;
  /** Clinic-local `YYYY-MM-DD`. */
  date: string;
  /** ISO instant of the chosen slot, '' when none. */
  startsAt: string;
  type: (typeof APPOINTMENT_TYPES)[number];
  durationMinutes: number;
  reason: string;
  notes: string;
  reminderChannels: ('SMS' | 'EMAIL')[];
}

const patientStep = z.object({
  patient: patientRef.nullable().refine((value) => value !== null, 'booking.errors.patient'),
});

const doctorStep = z.object({
  doctor: doctorRef.nullable().refine((value) => value !== null, 'booking.errors.doctor'),
});

const dateTimeStep = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'booking.errors.date'),
  startsAt: z.string().min(1, 'booking.errors.slot'),
});

const detailsStep = z.object({
  type: z.enum(APPOINTMENT_TYPES),
  durationMinutes: z
    .number({ error: 'booking.errors.duration' })
    .int('booking.errors.duration')
    .min(5, 'booking.errors.duration')
    .max(240, 'booking.errors.duration'),
  reason: z.string().max(500, 'booking.errors.reasonLength'),
  notes: z.string().max(1000, 'booking.errors.notesLength'),
  reminderChannels: z.array(z.enum(['SMS', 'EMAIL'])),
});

const reviewStep = z.object({});

export const STEP_SCHEMAS: Record<StepId, z.ZodType> = {
  patient: patientStep,
  doctor: doctorStep,
  datetime: dateTimeStep,
  details: detailsStep,
  review: reviewStep,
};

export function emptyForm(defaults: { duration: number }): BookingForm {
  return {
    patient: null,
    doctor: null,
    specialty: '',
    date: '',
    startsAt: '',
    type: 'CONSULTATION',
    durationMinutes: defaults.duration,
    reason: '',
    notes: '',
    reminderChannels: ['SMS', 'EMAIL'],
  };
}

/** First validation error key of a step, or null when the step is valid. */
export function validateStep(step: StepId, values: BookingForm): Record<string, string> | null {
  const result = STEP_SCHEMAS[step].safeParse(values);
  if (result.success) return null;
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 5) return phone;
  return `${phone.slice(0, Math.min(6, phone.length - 4))} ••• ${digits.slice(-4)}`;
}

// ---------------------------------------------------------------- draft

const DRAFT_KEY = 'riaya.booking.draft';

export interface BookingDraft {
  step: number;
  form: BookingForm;
}

export function readDraft(): BookingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingDraft;
    if (typeof parsed.step !== 'number' || !parsed.form) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(draft: BookingDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the draft simply does not persist.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
