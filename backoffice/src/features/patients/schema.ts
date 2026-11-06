import type { CreatePatientInput } from '@riaya/shared';
import { z } from 'zod';

const PHONE = /^\+?[\d\s().-]{6,20}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Messages are i18n keys; `Field` translates them. */
export const patientFormSchema = z.object({
  firstName: z.string().trim().min(1, 'patients.errors.required').max(80),
  lastName: z.string().trim().min(1, 'patients.errors.required').max(80),
  dateOfBirth: z
    .string()
    .min(1, 'patients.errors.required')
    .refine((v) => v <= todayIso(), 'patients.errors.dobFuture'),
  phone: z.string().trim().min(1, 'patients.errors.required').regex(PHONE, 'patients.errors.phone'),
  email: z.union([z.literal(''), z.string().trim().email('patients.errors.email')]),
  gender: z.enum(['', 'female', 'male']),
  address: z.string().max(300),
  contactPreference: z.enum(['SMS', 'EMAIL', 'PHONE']),
  adminNotes: z.string().max(2000),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  gender: '',
  address: '',
  contactPreference: 'SMS',
  adminNotes: '',
};

/** Drop empty optional fields so the API never receives an empty email or gender. */
export function toCreateInput(values: PatientFormValues): CreatePatientInput {
  const input: CreatePatientInput = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    dateOfBirth: values.dateOfBirth,
    phone: values.phone.trim(),
    contactPreference: values.contactPreference,
  };
  if (values.email.trim()) input.email = values.email.trim();
  if (values.gender) input.gender = values.gender;
  if (values.address.trim()) input.address = values.address.trim();
  if (values.adminNotes.trim()) input.adminNotes = values.adminNotes.trim();
  return input;
}
