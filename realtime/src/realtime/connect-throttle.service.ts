import { Injectable } from '@nestjs/common';
import { RedisClientsService } from '../redis/redis-clients.service';

/** Window length for the connect-attempt counter, in seconds (NFR-013). */
const WINDOW_SECONDS = 60;

/** Attempts allowed per IP per window. A legitimate client needs one. */
const MAX_ATTEMPTS = 30;

const KEY_PREFIX = 'realtime:connect:';

/** Anti-growth bound for the in-process fallback map. */
const MAX_LOCAL_KEYS = 10_000;

interface LocalWindow {
  count: number;
  expiresAt: number;
}

/**
 * Per-IP connection-attempt throttle (T7.2, NFR-013).
 *
 * A fixed window in Redis, so every instance counts the same guesses. When Redis
 * is unreachable the counter degrades to a process-local map instead of opening
 * the door or throwing: a throttle outage must not become a connection outage,
 * and it must not silently stop limiting either.
 */
@Injectable()
export class ConnectThrottleService {
  private readonly local = new Map<string, LocalWindow>();

  constructor(private readonly redis: RedisClientsService) {}

  /** True when this attempt may proceed. Never throws. */
  async consume(address: string | undefined): Promise<boolean> {
    const ip =
      typeof address === 'string' && address.length > 0 && address.length <= 64
        ? address
        : 'unknown';

    if (this.redis.status === 'up') {
      try {
        return (await this.incrementRedis(ip)) <= MAX_ATTEMPTS;
      } catch {
        // Fall through: count locally rather than let the connection through.
      }
    }

    return this.incrementLocal(ip) <= MAX_ATTEMPTS;
  }

  private async incrementRedis(ip: string): Promise<number> {
    const key = `${KEY_PREFIX}${ip}`;
    const count = await this.redis.publisher.incr(key);

    if (count === 1) {
      await this.redis.publisher.expire(key, WINDOW_SECONDS);
    }

    return count;
  }

  private incrementLocal(ip: string): number {
    const now = Date.now();
    const existing = this.local.get(ip);
    const live = existing && existing.expiresAt > now ? existing : undefined;
    const count = (live?.count ?? 0) + 1;

    this.local.set(ip, {
      count,
      expiresAt: live?.expiresAt ?? now + WINDOW_SECONDS * 1000,
    });

    if (this.local.size > MAX_LOCAL_KEYS) {
      this.prune(now);
    }

    return count;
  }

  private prune(now: number): void {
    for (const [ip, window] of this.local) {
      if (window.expiresAt <= now) {
        this.local.delete(ip);
      }
    }
  }
}
