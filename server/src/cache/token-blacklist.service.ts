import { Injectable } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

/**
 * Redis-backed refresh-token revocation list.
 *
 * A revoked token is stored under its SHA-256 hash with a TTL equal to the
 * token's remaining lifetime, so entries expire on their own and the list
 * cannot grow without bound. Entries are shared across API instances, which a
 * per-process map could never guarantee (FR-015, AC-040).
 *
 * Reads and writes use the strict Redis methods on purpose: if Redis is down we
 * must not silently accept a token we cannot prove is un-revoked.
 */
@Injectable()
export class TokenBlacklistService {
  private static readonly KEY_PREFIX = 'auth:blacklist:';

  constructor(private readonly redis: RedisCacheService) {}

  private key(tokenHash: string): string {
    return `${TokenBlacklistService.KEY_PREFIX}${tokenHash}`;
  }

  /**
   * Record a revocation. `ttlSeconds` should be the token's remaining life so
   * the entry disappears exactly when the token itself would have expired.
   */
  async revoke(tokenHash: string, ttlSeconds: number): Promise<void> {
    await this.redis.setStrict(this.key(tokenHash), 1, Math.max(1, ttlSeconds));
  }

  /** True when the token has been revoked. Throws if Redis is unavailable. */
  async isRevoked(tokenHash: string): Promise<boolean> {
    const hit = await this.redis.getStrict<number>(this.key(tokenHash));
    return hit !== null;
  }

  /** Remove a single entry. Used when a token is rotated rather than revoked. */
  async forget(tokenHash: string): Promise<void> {
    await this.redis.delStrict(this.key(tokenHash));
  }
}
