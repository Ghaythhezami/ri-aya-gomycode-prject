import type { PortalSlot } from '@riaya/shared';
import { portalErrorCode, portalErrorDetails } from './session';

/** True when the API refused the slot because someone else took it (409 SLOT_CONFLICT). */
export function isSlotConflict(error: unknown): boolean {
  return portalErrorCode(error) === 'SLOT_CONFLICT';
}

/**
 * Alternative slots offered with a SLOT_CONFLICT. The contract only promises "alternatives",
 * so this accepts `details` as an array or as `{ alternatives: [...] }`, and ignores entries
 * without a valid start.
 */
export function conflictAlternatives(error: unknown): PortalSlot[] {
  const details = portalErrorDetails(error) as unknown;
  const list = Array.isArray(details)
    ? details
    : Array.isArray((details as { alternatives?: unknown } | null)?.alternatives)
      ? ((details as { alternatives: unknown[] }).alternatives as unknown[])
      : [];
  const out: PortalSlot[] = [];
  for (const item of list) {
    const startsAt = (item as { startsAt?: unknown })?.startsAt;
    if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) continue;
    const endsAt = (item as { endsAt?: unknown }).endsAt;
    out.push({ startsAt, endsAt: typeof endsAt === 'string' ? endsAt : startsAt });
  }
  return out.slice(0, 6);
}
