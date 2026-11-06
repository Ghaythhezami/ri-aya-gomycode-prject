import { can, type Capability } from '@riaya/shared';

/**
 * Whether the signed-in user may use `capability` in the active clinic.
 *
 * Reads the effective capabilities the API returns on `/auth/me` (custom and customised
 * roles, ADR 0004); falls back to the default matrix of the role name while an older
 * session payload without `capabilities` is in memory. Unknown means deny.
 */
export function canUser(
  user: { role?: string | null; capabilities?: readonly string[] } | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;
  if (Array.isArray(user.capabilities)) return user.capabilities.includes(capability);
  return can(user.role, capability);
}
