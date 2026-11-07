import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Shared security state (lockout counters, revoked refresh tokens) in PostgreSQL,
 * for deployments without Redis (the hosted demo on Vercel, ADR 0001).
 *
 * Mirrors the Redis semantics the strict store relies on:
 * - values are JSON strings with a mandatory expiry;
 * - `increment` is atomic (`INSERT … ON CONFLICT DO UPDATE`), sets the TTL on the
 *   first hit and keeps it on later hits, and restarts an expired counter at 1;
 * - `ttl` returns the remaining seconds, or -2 when the key is absent or expired.
 *
 * Every serverless instance reads the same rows, so a lockout triggered on one
 * instance holds on all of them. Expired rows are swept opportunistically.
 */
export class PostgresSecurityStore {
  private lastSweep = 0;

  constructor(private readonly db: PrismaClient) {}

  async get(key: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ value: string }[]>`
      SELECT "value" FROM "security_state" WHERE "key" = ${key} AND "expiresAt" > now()`;
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const ttl = Math.max(1, Math.ceil(ttlSeconds));
    await this.db.$executeRaw`
      INSERT INTO "security_state" ("key", "value", "expiresAt")
      VALUES (${key}, ${value}, now() + make_interval(secs => ${ttl}))
      ON CONFLICT ("key") DO UPDATE
        SET "value" = EXCLUDED."value", "expiresAt" = EXCLUDED."expiresAt"`;
    await this.maybeSweep();
  }

  async del(key: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM "security_state" WHERE "key" = ${key}`;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const ttl = Math.max(1, Math.ceil(ttlSeconds));
    const rows = await this.db.$queryRaw<{ value: string }[]>`
      INSERT INTO "security_state" ("key", "value", "expiresAt")
      VALUES (${key}, '1', now() + make_interval(secs => ${ttl}))
      ON CONFLICT ("key") DO UPDATE SET
        "value" = CASE
          WHEN "security_state"."expiresAt" <= now() THEN '1'
          ELSE (("security_state"."value")::int + 1)::text
        END,
        "expiresAt" = CASE
          WHEN "security_state"."expiresAt" <= now() THEN now() + make_interval(secs => ${ttl})
          ELSE "security_state"."expiresAt"
        END
      RETURNING "value"`;
    await this.maybeSweep();
    return Number(rows[0]?.value ?? 1);
  }

  /** Atomic `INCRBY` (delta may be negative); same TTL semantics as `increment`. */
  async incrementBy(key: string, delta: number, ttlSeconds: number): Promise<number> {
    const ttl = Math.max(1, Math.ceil(ttlSeconds));
    const by = Math.trunc(delta);
    const rows = await this.db.$queryRaw<{ value: string }[]>`
      INSERT INTO "security_state" ("key", "value", "expiresAt")
      VALUES (${key}, ${String(by)}, now() + make_interval(secs => ${ttl}))
      ON CONFLICT ("key") DO UPDATE SET
        "value" = CASE
          WHEN "security_state"."expiresAt" <= now() THEN ${String(by)}
          ELSE (("security_state"."value")::bigint + ${by}::bigint)::text
        END,
        "expiresAt" = CASE
          WHEN "security_state"."expiresAt" <= now() THEN now() + make_interval(secs => ${ttl})
          ELSE "security_state"."expiresAt"
        END
      RETURNING "value"`;
    await this.maybeSweep();
    return Number(rows[0]?.value ?? by);
  }

  async ttl(key: string): Promise<number> {
    const rows = await this.db.$queryRaw<{ seconds: number | null }[]>`
      SELECT CEIL(EXTRACT(EPOCH FROM ("expiresAt" - now())))::int AS "seconds"
      FROM "security_state" WHERE "key" = ${key} AND "expiresAt" > now()`;
    const seconds = rows[0]?.seconds;
    return seconds === undefined || seconds === null ? -2 : Math.max(1, seconds);
  }

  /** Delete rows that expired more than an hour ago, at most once per 10 minutes per instance. */
  private async maybeSweep(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSweep < 10 * 60_000) return;
    this.lastSweep = now;
    await this.db
      .$executeRaw(
        Prisma.sql`DELETE FROM "security_state" WHERE "expiresAt" < now() - interval '1 hour'`,
      )
      .catch(() => undefined);
  }
}
