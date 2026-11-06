import type { AlternativeSlot, DayPeriod } from '@riaya/shared';

export const MAX_ALTERNATIVES = 3;

export interface CandidateSlot {
  doctorId: string;
  doctorName: string;
  startsAt: Date;
  endsAt: Date;
  period: DayPeriod;
}

/**
 * Picks up to three alternatives: the same doctor's slots nearest to the requested
 * start (absolute distance; the earlier slot wins a tie), then, when fewer than
 * three, the earliest slots of other doctors with the same specialty.
 * Candidates must already be available.
 */
export function selectAlternatives(input: {
  requestedStart: Date;
  sameDoctor: CandidateSlot[];
  sameSpecialty: CandidateSlot[];
  limit?: number;
}): AlternativeSlot[] {
  const limit = input.limit ?? MAX_ALTERNATIVES;
  const target = input.requestedStart.getTime();
  const seen = new Set<string>();
  const result: AlternativeSlot[] = [];
  const push = (slot: CandidateSlot, kind: AlternativeSlot['kind']) => {
    const key = `${slot.doctorId}|${slot.startsAt.getTime()}`;
    if (seen.has(key) || result.length >= limit) return;
    seen.add(key);
    result.push({
      doctorId: slot.doctorId,
      doctorName: slot.doctorName,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      available: true,
      period: slot.period,
      kind,
    });
  };

  const sameDoctor = [...input.sameDoctor]
    .filter((s) => s.startsAt.getTime() !== target)
    .sort((a, b) => {
      const da = Math.abs(a.startsAt.getTime() - target);
      const db = Math.abs(b.startsAt.getTime() - target);
      return da - db || a.startsAt.getTime() - b.startsAt.getTime();
    });
  for (const slot of sameDoctor) push(slot, 'SAME_DOCTOR');

  if (result.length < limit) {
    const others = [...input.sameSpecialty].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.doctorName.localeCompare(b.doctorName),
    );
    for (const slot of others) push(slot, 'SAME_SPECIALTY');
  }
  return result;
}
