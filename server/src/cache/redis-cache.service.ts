import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  status: 'up' | 'down' | 'memory' = 'memory';

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || process.env.NODE_ENV === 'test') {
      this.status = 'memory';
      return;
    }

    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on('error', (error) => {
      this.logger.warn(`Redis unavailable, using in-memory cache: ${error.message}`);
      this.status = 'memory';
      this.client = null;
    });
    redis
      .connect()
      .then(() => {
        this.client = redis;
        this.status = 'up';
      })
      .catch(() => {
        this.status = 'memory';
        this.client = null;
      });
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.client ? await this.safeRedisGet(key) : this.memoryGet(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Redis-only read. Throws when Redis is unavailable so callers can fail closed
   * rather than read a stale per-process map that another instance cannot see.
   */
  async getStrict<T>(key: string): Promise<T | null> {
    const client = this.requireClient();
    const raw = await client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 60) {
    const raw = JSON.stringify(value);
    if (this.client) {
      try {
        await this.client.set(key, raw, 'EX', ttlSeconds);
        return;
      } catch {
        this.status = 'memory';
      }
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /**
   * Redis-only write with a mandatory TTL. Throws when Redis is unavailable.
   */
  async setStrict(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.requireClient();
    await client.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async del(key: string) {
    if (this.client) {
      try {
        await this.client.del(key);
      } catch {
        this.status = 'memory';
      }
    }
    this.memory.delete(key);
  }

  /** Redis-only delete. Throws when Redis is unavailable. */
  async delStrict(key: string): Promise<void> {
    const client = this.requireClient();
    await client.del(key);
  }

  /**
   * Atomically increment a counter and (re)apply its TTL on the first hit.
   * Used for failed-login counting, so concurrent requests cannot lose an
   * increment. Returns the value after incrementing.
   */
  async incrementStrict(key: string, ttlSeconds: number): Promise<number> {
    const client = this.requireClient();
    const value = await client.incr(key);
    if (value === 1) {
      await client.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
    }
    return value;
  }

  /** Remaining TTL in seconds. Returns -2 when the key does not exist. */
  async ttlStrict(key: string): Promise<number> {
    const client = this.requireClient();
    return client.ttl(key);
  }

  private async safeRedisGet(key: string) {
    try {
      return await this.client!.get(key);
    } catch {
      this.status = 'memory';
      return this.memoryGet(key);
    }
  }

  private memoryGet(key: string) {
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value;
  }

  /**
   * True only when a live Redis connection is available. Security paths use the
   * `strict*` methods below, which throw instead of silently degrading to the
   * per-process in-memory map: a cache outage must never disable brute-force
   * protection (CON-514, NFR-009).
   */
  get isRedisConnected(): boolean {
    return this.client !== null;
  }

  private requireClient(): Redis {
    if (!this.client) {
      throw new Error('Redis unavailable: security state requires a live connection');
    }
    return this.client;
  }
}
