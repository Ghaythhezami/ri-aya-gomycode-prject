import { Injectable } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

/** Lockout policy, kept in one place so the API and its docs cannot disagree. */
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 10 * 60; // 10 minutes
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_SECONDS = 15 * 60; // 15 minutes

/**
 * Redis-backed failed-login counter and lockout store.
 *
 * The spec requires lockout state in Redis rather than Postgres (FR-013,
 * FR-014): it must survive an API restart (AC-009) and be shared by every
 * instance. Every method here is strict — if Redis is unreachable the caller
 * must fail closed instead of letting attempts through (NFR-009, AC-031).
 */
@Injectable()
export class LoginAttemptService {
  private static readonly FAIL_KEY = 'auth:fail:';
  private static readonly LOCK_KEY = 'auth:lock:';

  constructor(private readonly redis: RedisCacheService) {}

  /**
   * Record one failed attempt and lock the account when the threshold is
   * reached. Returns the current lockout expiry, or null when not locked.
   */
  async registerFailure(
    identifier: string,
  ): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const key = `${LoginAttemptService.FAIL_KEY}${identifier.toLowerCase()}`;
    const attempts = await this.redis.incrementStrict(key, LOGIN_ATTEMPT_WINDOW_SECONDS);

    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      await this.redis.setStrict(
        `${LoginAttemptService.LOCK_KEY}${identifier.toLowerCase()}`,
        1,
        LOGIN_LOCKOUT_SECONDS,
      );
      // Reset the counter so a later unlock starts from a clean window.
      await this.redis.delStrict(key);
      return { attempts, lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_SECONDS * 1000) };
    }

    return { attempts, lockedUntil: null };
  }

  /**
   * Read the current lockout state without mutating it.
   * `remainingSeconds` is 0 when the account is not locked.
   */
  async getLockout(identifier: string): Promise<{ locked: boolean; remainingSeconds: number }> {
    const key = `${LoginAttemptService.LOCK_KEY}${identifier.toLowerCase()}`;
    const ttl = await this.redis.ttlStrict(key);
    if (ttl > 0) {
      return { locked: true, remainingSeconds: ttl };
    }
    return { locked: false, remainingSeconds: 0 };
  }

  /** Clear both the counter and the lockout. Called after a successful login. */
  async clear(identifier: string): Promise<void> {
    const id = identifier.toLowerCase();
    await this.redis.delStrict(`${LoginAttemptService.FAIL_KEY}${id}`);
    await this.redis.delStrict(`${LoginAttemptService.LOCK_KEY}${id}`);
  }
}
