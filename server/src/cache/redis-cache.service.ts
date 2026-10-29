import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
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

    // The client is created ONCE and kept for the whole process lifetime, because
    // ioredis reconnects on its own. The previous version nulled `client` on the
    // first `error` event, which permanently disabled Redis: a login that saw one
    // failed connect (e.g. the API booted before the container was ready) kept
    // returning SECURITY_STATE_UNAVAILABLE until the API was restarted, even
    // after Redis came up.
    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      // Fail a command fast while disconnected instead of hanging the request.
      maxRetriesPerRequest: 1,
      // Keep retrying with a capped backoff rather than giving up for good.
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    let reportedDown = false;
    this.client.on('ready', () => {
      this.status = 'up';
      reportedDown = false;
    });
    this.client.on('error', (error) => {
      this.status = 'down';
      // ioredis emits `error` on every failed retry, so log the transition only;
      // otherwise the terminal is flooded once every couple of seconds.
      if (!reportedDown) {
        this.logger.warn(`Redis unavailable, security state fails closed: ${error.message}`);
        reportedDown = true;
      }
    });

    // ioredis keeps retrying in the background; the `ready` handler recovers.
    this.client.connect().catch(() => {
      this.status = 'down';
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.isRedisConnected ? await this.safeRedisGet(key) : this.memoryGet(key);
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
    if (this.useStrictMemory) return this.get<T>(key);
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
    const client = this.isRedisConnected ? this.client : null;
    if (client) {
      try {
        await client.set(key, raw, 'EX', ttlSeconds);
        return;
      } catch {
        this.status = 'down';
      }
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /**
   * Redis-only write with a mandatory TTL. Throws when Redis is unavailable.
   */
  async setStrict(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.useStrictMemory) {
      await this.set(key, value, ttlSeconds);
      return;
    }
    const client = this.requireClient();
    await client.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async del(key: string) {
    const client = this.isRedisConnected ? this.client : null;
    if (client) {
      try {
        await client.del(key);
      } catch {
        this.status = 'down';
      }
    }
    this.memory.delete(key);
  }

  /** Redis-only delete. Throws when Redis is unavailable. */
  async delStrict(key: string): Promise<void> {
    if (this.useStrictMemory) {
      await this.del(key);
      return;
    }
    const client = this.requireClient();
    await client.del(key);
  }

  /**
   * Atomically increment a counter and (re)apply its TTL on the first hit.
   * Used for failed-login counting, so concurrent requests cannot lose an
   * increment. Returns the value after incrementing.
   */
  async incrementStrict(key: string, ttlSeconds: number): Promise<number> {
    if (this.useStrictMemory) return this.memoryIncrement(key, ttlSeconds);
    const client = this.requireClient();
    const value = await client.incr(key);
    if (value === 1) {
      await client.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
    }
    return value;
  }

  /** Remaining TTL in seconds. Returns -2 when the key does not exist. */
  async ttlStrict(key: string): Promise<number> {
    if (this.useStrictMemory) return this.memoryTtl(key);
    const client = this.requireClient();
    return client.ttl(key);
  }

  private async safeRedisGet(key: string) {
    try {
      return await this.client!.get(key);
    } catch {
      this.status = 'down';
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
   * Process-local `INCR` + `EXPIRE`-on-first-hit, used only by the strict test
   * seam. The TTL is set when the key is created and preserved on later
   * increments, matching Redis semantics.
   */
  private memoryIncrement(key: string, ttlSeconds: number): number {
    const hit = this.memory.get(key);
    const live = hit && hit.expiresAt > Date.now() ? hit : undefined;
    const value = (live ? Number(JSON.parse(live.value)) : 0) + 1;
    this.memory.set(key, {
      value: JSON.stringify(value),
      expiresAt: live ? live.expiresAt : Date.now() + Math.max(1, Math.ceil(ttlSeconds)) * 1000,
    });
    return value;
  }

  /** Process-local `TTL`, mirroring Redis: -2 when the key does not exist. */
  private memoryTtl(key: string): number {
    const hit = this.memory.get(key);
    if (!hit || hit.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return -2;
    }
    return Math.ceil((hit.expiresAt - Date.now()) / 1000);
  }

  /**
   * True only when a live Redis connection is available. Security paths use the
   * `strict*` methods below, which throw instead of silently degrading to the
   * per-process in-memory map: a cache outage must never disable brute-force
   * protection (CON-514, NFR-009).
   */
  get isRedisConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * True only under `NODE_ENV=test`, where Redis is intentionally absent (see
   * the constructor) so the suite can run without infrastructure. The strict
   * store then drains to the process-local map instead of throwing, which keeps
   * the fail-closed code path exercisable in tests. Every other environment
   * fails closed (NFR-009, AC-031).
   */
  private get useStrictMemory(): boolean {
    return this.client === null && process.env.NODE_ENV === 'test';
  }

  private requireClient(): Redis {
    if (!this.client || this.client.status !== 'ready') {
      // Fail closed, but as an INTENTIONAL, coded, retryable response. A bare
      // Error here surfaced as an unhandled 500 INTERNAL_ERROR, which is neither
      // retryable by code nor distinguishable from a genuine bug.
      throw new ServiceUnavailableException({
        code: 'SECURITY_STATE_UNAVAILABLE',
        message: 'Security state is temporarily unavailable. Please try again shortly.',
      });
    }
    return this.client;
  }
}
