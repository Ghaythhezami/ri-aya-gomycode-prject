import { Throttle } from '@nestjs/throttler';

/** Window used by every per-route limit. */
export const RATE_LIMIT_TTL_MS = 60_000;

/** Limit used under NODE_ENV=test unless a spec opts in with THROTTLE_STRICT=1. */
const RELAXED_TEST_LIMIT = 1000;

/**
 * Resolved per request (not at import time), so a spec can switch strict
 * limits on with `process.env.THROTTLE_STRICT = '1'` after the module loaded.
 */
export function effectiveLimit(limit: number): number {
  const relaxed = process.env.NODE_ENV === 'test' && process.env.THROTTLE_STRICT !== '1';
  return relaxed ? RELAXED_TEST_LIMIT : limit;
}

/**
 * Per-route rate limit (QA-2): `limit` requests per minute per client IP, then
 * 429 with a `Retry-After` header. Counters are per instance (see
 * docs/THREAT-MODEL.md for the serverless caveat).
 */
export const RateLimit = (limit: number) =>
  Throttle({ default: { limit: () => effectiveLimit(limit), ttl: RATE_LIMIT_TTL_MS } });
