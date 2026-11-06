import { z } from 'zod';

/**
 * Tenancy input contracts.
 *
 * Mirrors `server/src/tenancy/dto/register.dto.ts` and
 * `server/src/tenancy/dto/invitation.dto.ts`. The role enum lists exactly the values
 * the API accepts (`UserRole` in `server/src/users/user-role.enum.ts`): a value that
 * is missing here would be rejected with a 400 at runtime.
 */

/** `UserRole` — kept in the same order as the server enum so serialised output matches. */
export const userRoleSchema = z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST']);

export type UserRole = z.infer<typeof userRoleSchema>;

/** The locales the apps ship; `RegisterDto.preferredLocale` accepts the same three. */
export const supportedLocaleSchema = z.enum(['en', 'ar', 'fr']);

export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

/** `RegisterDto` — the password is at least 8 characters. */
export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
  organizationName: z.string(),
  clinicName: z.string(),
  preferredLocale: supportedLocaleSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** `InviteDto` — the invitee's email, the clinic they join, and the role they get. */
export const invitationSchema = z.object({
  email: z.email(),
  clinicId: z.uuid(),
  role: userRoleSchema,
});

export type InvitationInput = z.infer<typeof invitationSchema>;

/** `AcceptInvitationDto` — an optional display name alongside the new password (at least 8 characters). */
export const acceptInvitationSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/** `CreateOrganizationDto` — the organization and its first clinic. */
export const createOrganizationSchema = z.object({
  organizationName: z.string(),
  clinicName: z.string(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * `InvitationStatus` — the persisted lifecycle of an invitation (FR-042).
 * `EXPIRED` is deliberately absent: it is derived at read time for a PENDING row
 * whose `expiresAt` has passed, so the client must compute it from `status` plus
 * `expiresAt` rather than expect it as a stored value.
 */
export const invitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED']);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** The status a client renders, including the derived `EXPIRED`. */
export const invitationDisplayStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

export type InvitationDisplayStatus = z.infer<typeof invitationDisplayStatusSchema>;

/** `DeliveryStatus` — recorded outcome of the invitation email send (FR-041). */
export const deliveryStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED']);

export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

/** `ChangeRoleDto` — the new role for a membership (FR-045). */
export const changeRoleSchema = z.object({
  role: userRoleSchema,
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
