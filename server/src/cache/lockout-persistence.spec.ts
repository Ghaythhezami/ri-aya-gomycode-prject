import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../cache/redis-cache.service';
import { LoginAttemptService, LOGIN_MAX_ATTEMPTS } from '../cache/login-attempt.service';

/**
 * TEST-050 → AC-009: lockout state survives an API restart, because it lives in
 * Redis with a TTL rather than in process memory or Postgres.
 *
 * This is an INTEGRATION test: it needs a real Redis and therefore only runs
 * when explicitly enabled, so an ordinary `jest` run reports it as skipped
 * rather than pretending it passed.
 *
 *   $env:REDIS_URL='redis://localhost:6379'; $env:LOCKOUT_INTEGRATION='1'; npx jest lockout-persistence
 */
const ENABLED = process.env.LOCKOUT_INTEGRATION === '1' && Boolean(process.env.REDIS_URL);

const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;

/** Builds a cache and waits for it to connect, or returns null. */
async function connectedCache(): Promise<RedisCacheService | null> {
  // RedisCacheService deliberately bypasses Redis under NODE_ENV=test, so this
  // test presents itself as an ordinary runtime while it builds the client.
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const cache = new RedisCacheService(config);
  process.env.NODE_ENV = original;

  // ioredis needs a moment to complete the handshake; 5s is generous for a
  // container on loopback and still fails fast when nothing is listening.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (cache.isRedisConnected) return cache;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await cache.onModuleDestroy();
  return null;
}

(ENABLED ? describe : describe.skip)('Lockout persistence across a restart (AC-009)', () => {
  const email = 'lockout-restart@riaya.local';
  let cache: RedisCacheService;

  beforeAll(async () => {
    const connected = await connectedCache();
    if (!connected) {
      throw new Error('Redis is not reachable, so AC-009 cannot be verified in this run.');
    }
    cache = connected;
  });

  afterAll(async () => {
    // beforeAll throws when Redis is absent, so `cache` may be unassigned; the
    // cleanup must not mask that original failure with a TypeError.
    if (!cache) return;
    const attempts = new LoginAttemptService(cache);
    await attempts.clear(email);
    await cache.onModuleDestroy();
  });

  it('keeps the account locked for a brand-new cache instance', async () => {
    const before = new LoginAttemptService(cache);
    await before.clear(email);

    let locked = false;
    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const result = await before.registerFailure(email);
      if (result.lockedUntil) locked = true;
    }
    expect(locked).toBe(true);

    // Simulate an API restart: a fresh cache and service, sharing only Redis.
    const restarted = await connectedCache();
    expect(restarted).not.toBeNull();

    const afterRestart = await new LoginAttemptService(restarted as RedisCacheService).getLockout(
      email,
    );

    expect(afterRestart.locked).toBe(true);
    expect(afterRestart.remainingSeconds).toBeGreaterThan(0);

    await (restarted as RedisCacheService).onModuleDestroy();
  });
});
