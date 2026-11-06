import { Logger, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Atomic fixed-window counter with optional block, in one round trip:
 * KEYS[1] hits key, KEYS[2] block key; ARGV ttl ms, limit, block ms.
 * Returns { hits, ttlMs, blocked (0/1), blockTtlMs }.
 */
const SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

/**
 * Rate-limit counters shared by every API instance (serverless functions do not share
 * memory, so the in-memory default lets each instance allow the full limit). Uses Redis
 * when it is reachable and falls back to a per-process map, so a Redis outage degrades rate
 * limiting instead of failing requests.
 */
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: Redis | null;
  private readonly memory = new Map<
    string,
    { hits: number; expiresAt: number; blockedUntil: number }
  >();

  constructor(
    url: string | undefined,
    private readonly prefix = 'riaya:throttle:',
    private readonly now: () => number = Date.now,
  ) {
    this.client =
      url && process.env.NODE_ENV !== 'test'
        ? new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
        : null;
    this.client?.connect().catch(() => undefined);
    this.client?.on('error', () => undefined);
  }

  get backend(): 'redis' | 'memory' {
    return this.client?.status === 'ready' ? 'redis' : 'memory';
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${this.prefix}${throttlerName}:${key}`;
    if (this.client?.status === 'ready') {
      try {
        const [hits, ttlMs, blocked, blockTtl] = (await this.client.eval(
          SCRIPT,
          2,
          hitsKey,
          `${hitsKey}:block`,
          String(ttl),
          String(limit),
          String(blockDuration),
        )) as [number, number, number, number];
        return {
          totalHits: hits,
          timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
          isBlocked: blocked === 1,
          timeToBlockExpire: Math.max(0, Math.ceil(blockTtl / 1000)),
        };
      } catch (error) {
        this.logger.warn(`throttle fell back to memory: ${(error as Error).message}`);
      }
    }
    return this.memoryIncrement(hitsKey, ttl, limit, blockDuration);
  }

  private memoryIncrement(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = this.now();
    let entry = this.memory.get(key);
    if (entry && entry.blockedUntil > now) {
      return {
        totalHits: entry.hits,
        timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }
    if (!entry || entry.expiresAt <= now) {
      entry = { hits: 0, expiresAt: now + ttl, blockedUntil: 0 };
      this.memory.set(key, entry);
    }
    entry.hits += 1;
    if (entry.hits > limit && blockDuration > 0) entry.blockedUntil = now + blockDuration;
    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory)
        if (v.expiresAt <= now && v.blockedUntil <= now) this.memory.delete(k);
    }
    const blocked = entry.blockedUntil > now;
    return {
      totalHits: entry.hits,
      timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
      isBlocked: blocked,
      timeToBlockExpire: blocked ? Math.ceil((entry.blockedUntil - now) / 1000) : 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
