import {
  LOCALIZED_NAME_MAX,
  normalizeLocalized,
  type CreateDoctorInput,
  type DataLocale,
} from '@riaya/shared';
import { z } from 'zod';
import { EMPTY_LOCALIZED, canonicalFor } from '../patients/names';
import { isLocalizedFilled } from '../../common/LocalizedInput';

const lang = z.string().max(LOCALIZED_NAME_MAX, 'doctors.errors.tooLong');
const localizedName = z
  .object({ en: lang, fr: lang, ar: lang })
  .refine(isLocalizedFilled, 'localized.required');

export const doctorFormSchema = z.object({
  firstNameI18n: localizedName,
  lastNameI18n: localizedName,
  specialty: z.string().trim().min(1, 'doctors.errors.required').max(80),
  consultationMinutes: z.coerce
    .number({ message: 'doctors.errors.minutes' })
    .int('doctors.errors.minutes')
    .min(5, 'doctors.errors.minutes')
    .max(240, 'doctors.errors.minutes'),
  licenseNumber: z.string().max(60),
  roomId: z.string(),
});
export type DoctorFormInput = z.input<typeof doctorFormSchema>;
export type DoctorFormValues = z.output<typeof doctorFormSchema>;

export const EMPTY_DOCTOR_FORM: DoctorFormInput = {
  firstNameI18n: { ...EMPTY_LOCALIZED },
  lastNameI18n: { ...EMPTY_LOCALIZED },
  specialty: '',
  consultationMinutes: 30,
  licenseNumber: '',
  roomId: '',
};

/** Request body: localized names, plus canonical names only when typed in the clinic default language. */
export function toDoctorInput(
  values: DoctorFormValues,
  defaultLanguage?: DataLocale,
): CreateDoctorInput {
  const body: CreateDoctorInput = {
    firstNameI18n: normalizeLocalized(values.firstNameI18n),
    lastNameI18n: normalizeLocalized(values.lastNameI18n),
    specialty: values.specialty,
    consultationMinutes: values.consultationMinutes,
    roomId: values.roomId || null,
  };
  const firstName = canonicalFor(values.firstNameI18n, defaultLanguage);
  const lastName = canonicalFor(values.lastNameI18n, defaultLanguage);
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (values.licenseNumber.trim()) body.licenseNumber = values.licenseNumber.trim();
  return body;
}
