import { RedisClientsService } from '../redis/redis-clients.service';
import { ConnectThrottleService } from './connect-throttle.service';

const REDIS_UP = 'up' as const;
const REDIS_DOWN = 'down' as const;

const build = (
  status: 'up' | 'down',
  incr: jest.Mock = jest.fn().mockResolvedValue(1),
): { throttle: ConnectThrottleService; incr: jest.Mock; expire: jest.Mock } => {
  const expire = jest.fn().mockResolvedValue(1);
  const redis = {
    status,
    publisher: { incr, expire },
  } as unknown as RedisClientsService;

  return { throttle: new ConnectThrottleService(redis), incr, expire };
};

describe('ConnectThrottleService', () => {
  // TEST-001 → AC-001
  it('TEST-001/AC-001: an attempt inside the limit is allowed', async () => {
    const { throttle, expire } = build(REDIS_UP, jest.fn().mockResolvedValue(1));

    await expect(throttle.consume('203.0.113.9')).resolves.toBe(true);
    expect(expire).toHaveBeenCalledWith(expect.stringContaining('203.0.113.9'), 60);
  });

  // TEST-001 → AC-001
  it('TEST-001/AC-001: attempts past the limit are refused', async () => {
    const { throttle } = build(REDIS_UP, jest.fn().mockResolvedValue(31));

    await expect(throttle.consume('203.0.113.9')).resolves.toBe(false);
  });

  it('TEST-001/AC-001: an unusable address is bucketed rather than skipped', async () => {
    const { throttle, incr } = build(REDIS_UP);

    await throttle.consume(undefined);
    await throttle.consume('x'.repeat(80));

    expect(incr).toHaveBeenCalledWith(expect.stringContaining('unknown'));
  });

  it('TEST-001/AC-001: with Redis down the limit is still enforced locally', async () => {
    const { throttle } = build(REDIS_DOWN);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(throttle.consume('198.51.100.4')).resolves.toBe(true);
    }

    await expect(throttle.consume('198.51.100.4')).resolves.toBe(false);
  });

  it('TEST-001/AC-001: a Redis error falls back to the local counter instead of opening the door', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('connection lost'));
    const { throttle } = build(REDIS_UP, failing);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(throttle.consume('198.51.100.5')).resolves.toBe(true);
    }

    await expect(throttle.consume('198.51.100.5')).resolves.toBe(false);
  });
});
