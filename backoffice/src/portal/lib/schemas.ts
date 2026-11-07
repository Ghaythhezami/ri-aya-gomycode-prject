import { z } from 'zod';
import { DATA_LOCALES } from '@riaya/shared';

/** Mirrors the staff password policy: 10+ chars with upper, lower, digit and symbol. */
export const PASSWORD_MIN = 10;
export const PASSWORD_RULES = [
  { id: 'length', test: (p: string) => p.length >= PASSWORD_MIN },
  { id: 'lower', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', test: (p: string) => /\d/.test(p) },
  { id: 'symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function passwordChecks(password: string) {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, ok: rule.test(password) }));
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/** 0 (empty) .. 4 (strong): rules met, with a bonus step for length 14+. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const met = passwordChecks(password).filter((c) => c.ok).length + (password.length >= 14 ? 1 : 0);
  if (met <= 2) return 1;
  if (met <= 4) return 2;
  if (met === 5) return 3;
  return 4;
}

export function isPhoneValid(phone: string): boolean {
  return /^\+?[0-9 ()-]{7,20}$/.test(phone.trim());
}

const localizedName = z
  .record(z.string(), z.string().optional())
  .refine((v) => DATA_LOCALES.some((l) => Boolean(v?.[l]?.trim())), {
    message: 'portal.validation.nameRequired',
  });

const email = z
  .string()
  .trim()
  .min(1, 'portal.validation.emailRequired')
  .email('portal.validation.emailInvalid');
const password = z
  .string()
  .refine(isPasswordValid, { message: 'portal.validation.passwordPolicy' });
const phone = z.string().refine(isPhoneValid, { message: 'portal.validation.phoneInvalid' });

export const registerSchema = z.object({
  clinicId: z.string().min(1, 'portal.validation.clinicRequired'),
  firstNameI18n: localizedName,
  lastNameI18n: localizedName,
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'portal.validation.birthDateRequired')
    .refine((v) => v >= '1900-01-01', 'portal.validation.birthDateRequired')
    .refine((v) => v <= new Date().toISOString().slice(0, 10), 'portal.validation.birthDateFuture'),
  phone,
  email,
  password,
  preferredLocale: z.enum(['en', 'fr', 'ar']),
  acceptPrivacy: z.boolean().refine((v) => v === true, 'portal.validation.privacyRequired'),
  aiConsent: z.boolean(),
});
export type RegisterForm = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  clinicId: z.string().min(1, 'portal.validation.clinicRequired'),
  email,
  password: z.string().min(1, 'portal.validation.passwordRequired'),
});
export type LoginForm = z.infer<typeof loginSchema>;

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'portal.validation.birthDateRequired')
  .refine((v) => v >= '1900-01-01', 'portal.validation.birthDateRequired')
  .refine((v) => v <= new Date().toISOString().slice(0, 10), 'portal.validation.birthDateFuture');

export const inviteSchema = z.object({
  dateOfBirth: birthDate,
  email,
  password,
  acceptPrivacy: z.boolean().refine((v) => v === true, 'portal.validation.privacyRequired'),
  aiConsent: z.boolean(),
});
export type InviteForm = z.infer<typeof inviteSchema>;

export const profileSchema = z.object({
  firstNameI18n: localizedName,
  lastNameI18n: localizedName,
  phone,
  preferredLocale: z.enum(['en', 'fr', 'ar']),
});
export type ProfileForm = z.infer<typeof profileSchema>;

/** Message of a (possibly nested) react-hook-form error, e.g. a refine on a localized record. */
export function fieldMessage(error: unknown): string | undefined {
  const e = error as { message?: unknown; root?: { message?: unknown } } | undefined;
  if (typeof e?.message === 'string') return e.message;
  if (typeof e?.root?.message === 'string') return e.root.message;
  return undefined;
}
