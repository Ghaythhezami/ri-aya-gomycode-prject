import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PostgresSecurityStore } from './postgres-security-store';
import { RedisCacheService } from './redis-cache.service';

/**
 * In-memory stand-in for the four statements PostgresSecurityStore issues against
 * `security_state`. It mirrors the SQL semantics (expiry, upsert, atomic increment that
 * restarts an expired counter) so the store's mapping logic is exercised without a database.
 * The SQL itself was checked against local PostgreSQL and Neon when the store was introduced.
 */
function fakeDb(clock: { now: number }) {
  const rows = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string) => {
    const row = rows.get(key);
    return row && row.expiresAt > clock.now ? row : undefined;
  };
  const sql = (strings: TemplateStringsArray | { strings?: string[] }) =>
    Array.isArray(strings)
      ? strings.join('?')
      : ((strings as { strings?: string[] }).strings ?? []).join('?');

  const queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = sql(strings);
    if (text.includes('RETURNING') && text.includes('bigint')) {
      const [key, , ttl, , by] = values as [string, string, number, string, number];
      const row = live(key);
      const next = row
        ? { value: String(Number(row.value) + by), expiresAt: row.expiresAt }
        : { value: String(by), expiresAt: clock.now + ttl * 1000 };
      rows.set(key, next);
      return [{ value: next.value }];
    }
    if (text.includes('RETURNING')) {
      const [key, ttl] = values as [string, number];
      const row = live(key);
      const next = row
        ? { value: String(Number(row.value) + 1), expiresAt: row.expiresAt }
        : { value: '1', expiresAt: clock.now + ttl * 1000 };
      rows.set(key, next);
      return [{ value: next.value }];
    }
    if (text.includes('CEIL')) {
      const row = live(values[0] as string);
      return row ? [{ seconds: Math.ceil((row.expiresAt - clock.now) / 1000) }] : [];
    }
    const row = live(values[0] as string);
    return row ? [{ value: row.value }] : [];
  };

  const executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = sql(strings);
    if (text.includes('INSERT')) {
      const [key, value, ttl] = values as [string, string, number];
      rows.set(key, { value, expiresAt: clock.now + ttl * 1000 });
      return 1;
    }
    if (text.includes('interval')) {
      let removed = 0;
      for (const [key, row] of rows) {
        if (row.expiresAt < clock.now - 3_600_000) {
          rows.delete(key);
          removed += 1;
        }
      }
      return removed;
    }
    return rows.delete(values[0] as string) ? 1 : 0;
  };

  return { rows, db: { $queryRaw: queryRaw, $executeRaw: executeRaw } };
}

describe('PostgresSecurityStore', () => {
  const clock = { now: Date.now() };
  const realNow = Date.now;
  beforeEach(() => {
    clock.now = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('stores JSON values with an expiry and deletes them', async () => {
    const { db } = fakeDb(clock);
    const store = new PostgresSecurityStore(db as never);
    await store.set('k', '{"a":1}', 30);
    await expect(store.get('k')).resolves.toBe('{"a":1}');
    await expect(store.ttl('k')).resolves.toBe(30);
    await store.del('k');
    await expect(store.get('k')).resolves.toBeNull();
    await expect(store.ttl('k')).resolves.toBe(-2);
  });

  it('treats expired rows as absent', async () => {
    const { db } = fakeDb(clock);
    const store = new PostgresSecurityStore(db as never);
    await store.set('k', '"v"', 0.2);
    clock.now += 2_000;
    await expect(store.get('k')).resolves.toBeNull();
    await expect(store.ttl('k')).resolves.toBe(-2);
  });

  it('increments atomically, keeps the first TTL and restarts an expired counter', async () => {
    const { db } = fakeDb(clock);
    const store = new PostgresSecurityStore(db as never);
    await expect(store.increment('fail', 60)).resolves.toBe(1);
    clock.now += 10_000;
    await expect(store.increment('fail', 60)).resolves.toBe(2);
    await expect(store.ttl('fail')).resolves.toBe(50);
    clock.now += 61_000;
    await expect(store.increment('fail', 60)).resolves.toBe(1);
  });

  it('incrementBy adds signed deltas and keeps the first TTL', async () => {
    const { db } = fakeDb(clock);
    const store = new PostgresSecurityStore(db as never);
    await expect(store.incrementBy('budget', 20_000, 60)).resolves.toBe(20_000);
    clock.now += 10_000;
    await expect(store.incrementBy('budget', -5_000, 60)).resolves.toBe(15_000);
    await expect(store.ttl('budget')).resolves.toBe(50);
  });

  it('sweeps rows expired for more than an hour, at most every ten minutes', async () => {
    const { db, rows } = fakeDb(clock);
    const store = new PostgresSecurityStore(db as never);
    await store.set('old', '1', 1);
    clock.now += 2 * 3_600_000;
    await store.set('fresh', '1', 60);
    expect(rows.has('old')).toBe(false);
    await store.set('old2', '1', 1);
    clock.now += 2 * 3_600_000;
    await store.set('x', '1', 60);
    expect(rows.has('old2')).toBe(false);
  });
});

describe('RedisCacheService security-state routing', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    delete process.env.SECURITY_STATE_MEMORY;
  });

  it('uses PostgreSQL for strict methods when Redis is not configured', async () => {
    process.env.NODE_ENV = 'production';
    const { db, rows } = fakeDb({ now: Date.now() });
    const cache = new RedisCacheService(
      { get: () => undefined } as unknown as ConfigService,
      { rawClient: db } as never,
    );
    await cache.setStrict('revoked:1', { at: 1 }, 30);
    await expect(cache.getStrict<{ at: number }>('revoked:1')).resolves.toEqual({ at: 1 });
    await expect(cache.incrementStrict('auth:fail:x', 900)).resolves.toBe(1);
    await expect(cache.incrementStrict('auth:fail:x', 900)).resolves.toBe(2);
    await expect(cache.ttlStrict('auth:fail:x')).resolves.toBeGreaterThan(0);
    await cache.delStrict('auth:fail:x');
    expect(rows.has('auth:fail:x')).toBe(false);
    expect(rows.has('revoked:1')).toBe(true);
  });

  it('returns null for a strict value that is not valid JSON', async () => {
    process.env.NODE_ENV = 'production';
    const { db, rows } = fakeDb({ now: Date.now() });
    rows.set('bad', { value: 'not json', expiresAt: Date.now() + 60_000 });
    const cache = new RedisCacheService(
      { get: () => undefined } as unknown as ConfigService,
      { rawClient: db } as never,
    );
    await expect(cache.getStrict('bad')).resolves.toBeNull();
  });

  it('fails closed with SECURITY_STATE_UNAVAILABLE when Redis is configured but unreachable', async () => {
    process.env.NODE_ENV = 'production';
    const cache = new RedisCacheService({
      get: (key: string) => (key === 'REDIS_URL' ? 'redis://127.0.0.1:1' : undefined),
    } as unknown as ConfigService);
    try {
      await expect(cache.getStrict('k')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(cache.incrementStrict('k', 10)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // The lenient cache keeps working from memory meanwhile.
      await cache.set('soft', 1, 10);
      await expect(cache.get('soft')).resolves.toBe(1);
    } finally {
      await cache.onModuleDestroy();
    }
  }, 15_000);
});
