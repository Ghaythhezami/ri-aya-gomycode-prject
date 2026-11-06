import {
  LOCALIZED_NAME_MAX,
  normalizeLocalized,
  type CreatePatientInput,
  type DataLocale,
} from '@riaya/shared';
import { z } from 'zod';
import { isLocalizedFilled } from '../../common/LocalizedInput';
import { EMPTY_LOCALIZED, canonicalFor } from './names';

const PHONE = /^\+?[\d\s().-]{6,20}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const lang = z.string().max(LOCALIZED_NAME_MAX, 'patients.errors.tooLong');

/** A name in EN/FR/AR; at least one language must be filled. */
export const localizedNameSchema = z
  .object({ en: lang, fr: lang, ar: lang })
  .refine(isLocalizedFilled, 'localized.required');

/** Messages are i18n keys; `Field` translates them. */
export const patientFormSchema = z.object({
  firstNameI18n: localizedNameSchema,
  lastNameI18n: localizedNameSchema,
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
  firstNameI18n: { ...EMPTY_LOCALIZED },
  lastNameI18n: { ...EMPTY_LOCALIZED },
  dateOfBirth: '',
  phone: '',
  email: '',
  gender: '',
  address: '',
  contactPreference: 'SMS',
  adminNotes: '',
};

/** Drop empty optional fields so the API never receives an empty email or gender. */
export function toCreateInput(
  values: PatientFormValues,
  defaultLanguage?: DataLocale,
): CreatePatientInput {
  const input: CreatePatientInput = {
    firstNameI18n: normalizeLocalized(values.firstNameI18n),
    lastNameI18n: normalizeLocalized(values.lastNameI18n),
    dateOfBirth: values.dateOfBirth,
    phone: values.phone.trim(),
    contactPreference: values.contactPreference,
  };
  const firstName = canonicalFor(values.firstNameI18n, defaultLanguage);
  const lastName = canonicalFor(values.lastNameI18n, defaultLanguage);
  if (firstName) input.firstName = firstName;
  if (lastName) input.lastName = lastName;
  if (values.email.trim()) input.email = values.email.trim();
  if (values.gender) input.gender = values.gender;
  if (values.address.trim()) input.address = values.address.trim();
  if (values.adminNotes.trim()) input.adminNotes = values.adminNotes.trim();
  return input;
}
