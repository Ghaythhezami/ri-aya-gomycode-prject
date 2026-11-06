import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage (memory fallback)', () => {
  it('counts hits in a fixed window and resets after it', async () => {
    let now = 0;
    const storage = new RedisThrottlerStorage(undefined, 't:', () => now);
    expect(storage.backend).toBe('memory');
    const first = await storage.increment('ip', 60_000, 2, 0, 'default');
    const second = await storage.increment('ip', 60_000, 2, 0, 'default');
    const third = await storage.increment('ip', 60_000, 2, 0, 'default');
    expect([first.totalHits, second.totalHits, third.totalHits]).toEqual([1, 2, 3]);
    expect(third.timeToExpire).toBe(60);
    now = 61_000;
    expect((await storage.increment('ip', 60_000, 2, 0, 'default')).totalHits).toBe(1);
  });

  it('blocks for the block duration once the limit is exceeded', async () => {
    let now = 0;
    const storage = new RedisThrottlerStorage(undefined, 't:', () => now);
    await storage.increment('k', 1_000, 1, 5_000, 'login');
    const over = await storage.increment('k', 1_000, 1, 5_000, 'login');
    expect(over.isBlocked).toBe(true);
    now = 2_000;
    const stillBlocked = await storage.increment('k', 1_000, 1, 5_000, 'login');
    expect(stillBlocked.isBlocked).toBe(true);
    expect(stillBlocked.timeToBlockExpire).toBe(3);
    now = 6_000;
    expect((await storage.increment('k', 1_000, 1, 5_000, 'login')).isBlocked).toBe(false);
  });

  it('keeps throttler names and keys apart', async () => {
    const storage = new RedisThrottlerStorage(undefined, 't:', () => 0);
    await storage.increment('a', 60_000, 5, 0, 'x');
    expect((await storage.increment('a', 60_000, 5, 0, 'y')).totalHits).toBe(1);
    expect((await storage.increment('b', 60_000, 5, 0, 'x')).totalHits).toBe(1);
  });
});
