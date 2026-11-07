import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  it('AC-032: stores and reads values from memory when Redis is not configured', async () => {
    const cache = new RedisCacheService({
      get: () => undefined,
    } as unknown as ConfigService);

    await cache.set('greeting', { hello: 'riaya' }, 30);
    await expect(cache.get<{ hello: string }>('greeting')).resolves.toEqual({ hello: 'riaya' });
    await cache.del('greeting');
    await expect(cache.get('greeting')).resolves.toBeNull();
    expect(cache.status).toBe('memory');
  });

  it('incrementByStrict adds positive and negative deltas and keeps the counter', async () => {
    const cache = new RedisCacheService({
      get: () => undefined,
    } as unknown as ConfigService);
    await expect(cache.incrementByStrict('ai:budget:t', 20_000, 60)).resolves.toBe(20_000);
    await expect(cache.incrementByStrict('ai:budget:t', 5_000, 60)).resolves.toBe(25_000);
    await expect(cache.incrementByStrict('ai:budget:t', -15_000, 60)).resolves.toBe(10_000);
  });
});
