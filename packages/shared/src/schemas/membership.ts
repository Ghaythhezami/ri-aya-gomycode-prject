import { z } from 'zod';
import { userRoleSchema } from './tenancy';

/**
 * Response contracts.
 *
 * Mirrors `MembershipView` in `server/src/tenancy/tenancy.service.ts`, which is what
 * a signed-in client renders to choose a workspace. Every field is present in the
 * server's interface, so all five are required here.
 */
export const membershipViewSchema = z.object({
  membershipId: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  /** The organization name per language (en, fr, ar), when entered. */
  organizationNameI18n: z.record(z.string(), z.string()).optional(),
  clinicId: z.string(),
  clinicName: z.string(),
  /** The clinic name per language (en, fr, ar), when entered. */
  clinicNameI18n: z.record(z.string(), z.string()).optional(),
  role: userRoleSchema,
});

export type MembershipView = z.infer<typeof membershipViewSchema>;

/** The list returned by `POST /auth/memberships` for the workspace switcher. */
export const membershipListSchema = z.array(membershipViewSchema);

export type MembershipList = z.infer<typeof membershipListSchema>;
