/**
 * True when an error means "someone else got this slot": the exclusion constraint
 * `appointments_no_overlap`, a Postgres exclusion violation (23P01) or a
 * serialization failure (Prisma P2034 / Postgres 40001).
 */
export function isSlotConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; meta?: unknown };
  if (e.code === 'P2034' || e.code === '23P01' || e.code === '40001') return true;
  const haystack = `${e.message ?? ''} ${safeJson(e.meta)}`;
  return /appointments_no_overlap|23P01|40001|could not serialize access/i.test(haystack);
}

/** Serialization failures are worth retrying; an exclusion violation is a final answer. */
export function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; meta?: unknown };
  if (e.code === 'P2034' || e.code === '40001') return true;
  return /could not serialize access|40001/i.test(`${e.message ?? ''} ${safeJson(e.meta)}`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
