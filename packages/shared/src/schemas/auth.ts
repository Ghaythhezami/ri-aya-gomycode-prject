import { z } from 'zod';

/**
 * Auth input contracts.
 *
 * Each schema mirrors the matching `server/src/auth/dto/*.dto.ts` field for field:
 * the same format rules, the same length limits, the same optional members. The
 * DTO stays authoritative — the API validates with `class-validator`, and these
 * schemas describe the same shape for the clients.
 *
 * No message strings live here: a page passes its own translated message by
 * extending the schema, so the package stays free of i18n.
 */

/** `LoginDto` — email is trimmed and lower-cased by the API before it is validated. */
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** `SwitchWorkspaceDto` — the clinic to scope the new access token to. */
export const switchWorkspaceSchema = z.object({
  clinicId: z.uuid(),
});

export type SwitchWorkspaceInput = z.infer<typeof switchWorkspaceSchema>;

/** `ChangePasswordDto` — the new password is at least 10 characters. */
export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(10),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** `ForgotPasswordDto` — email is trimmed and lower-cased by the API. */
export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** `ResetPasswordDto` — the emailed token plus the new password (at least 10 characters). */
export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(10),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
