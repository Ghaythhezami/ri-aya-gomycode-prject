/**
 * Access-token claims (FR-003, NFR-001, NFR-014).
 *
 * The names come from `server/src/auth/jwt.strategy.ts`: `sub` is the user id,
 * `clinic_id` the active clinic, `role` the membership role. The schema is
 * strict because this service only ever sees tokens `server` signed - an
 * unexpected claim means two components disagree and the connection is refused
 * rather than half-trusted.
 */
import { z } from 'zod';

export const accessTokenClaimsSchema = z
  .object({
    sub: z.string().min(1),
    email: z.email().optional(),
    org_id: z.string().min(1).optional(),
    clinic_id: z.string().min(1),
    role: z.string().min(1),
    iat: z.number().int().optional(),
    exp: z.number().int(),
  })
  .strict();

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
