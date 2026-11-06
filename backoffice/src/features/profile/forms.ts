import { z } from 'zod';
import { DATA_LOCALES, LOCALIZED_NAME_MAX, hasLocalized, type ProfileDto } from '@riaya/shared';

/** Mirrors the server policy (password-strength.ts), as the registration wizard does. */
export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

const localized = z
  .record(z.string(), z.string().max(LOCALIZED_NAME_MAX))
  .refine((value) => hasLocalized(value), { message: 'profile.errors.nameRequired' });

export const profileSchema = z.object({
  firstNameI18n: localized,
  lastNameI18n: localized,
  jobTitle: z.string().trim().max(120, 'profile.errors.tooLong'),
  phone: z.string().trim().max(32, 'profile.errors.tooLong'),
  preferredLocale: z.enum(DATA_LOCALES),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'profile.errors.currentRequired'),
    newPassword: z.string().regex(PASSWORD_POLICY, 'profile.errors.weakPassword'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'profile.errors.mismatch',
  });
export type PasswordValues = z.infer<typeof passwordSchema>;

export function profileDefaults(profile: ProfileDto): ProfileValues {
  return {
    firstNameI18n: profile.firstNameI18n ?? {},
    lastNameI18n: profile.lastNameI18n ?? {},
    jobTitle: profile.jobTitle ?? '',
    phone: profile.phone ?? '',
    preferredLocale: profile.preferredLocale,
  };
}
