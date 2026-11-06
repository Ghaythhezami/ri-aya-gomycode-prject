import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RedisCacheService } from '../cache/redis-cache.service';

export const SLOT_LOCK_TTL_SECONDS = 300;

export interface StoredLock {
  token: string;
  userId: string;
  durationMinutes: number;
  expiresAt: string;
}

/** Redis slot locks (APP-2): `slot:{doctorId}:{startsAtISO}`, TTL 300 s. */
@Injectable()
export class SlotLockService {
  constructor(private readonly cache: RedisCacheService) {}

  static key(doctorId: string, startsAt: Date): string {
    return `slot:${doctorId}:${startsAt.toISOString()}`;
  }

  private tokenKey(token: string) {
    return `slot-token:${token}`;
  }

  async get(doctorId: string, startsAt: Date): Promise<StoredLock | null> {
    return this.cache.get<StoredLock>(SlotLockService.key(doctorId, startsAt));
  }

  /** The caller's lock, or the other user's lock when it is held by someone else. */
  async acquire(
    doctorId: string,
    startsAt: Date,
    durationMinutes: number,
    userId: string,
  ): Promise<{ ok: true; lock: StoredLock } | { ok: false }> {
    const existing = await this.get(doctorId, startsAt);
    if (existing && existing.userId !== userId) return { ok: false };
    const token = existing?.token ?? `${userId}-${randomBytes(8).toString('hex')}`;
    const lock: StoredLock = {
      token,
      userId,
      durationMinutes,
      expiresAt: new Date(Date.now() + SLOT_LOCK_TTL_SECONDS * 1000).toISOString(),
    };
    const key = SlotLockService.key(doctorId, startsAt);
    await this.cache.set(key, lock, SLOT_LOCK_TTL_SECONDS);
    await this.cache.set(this.tokenKey(token), key, SLOT_LOCK_TTL_SECONDS);
    return { ok: true, lock };
  }

  /** Releases only when the token matches the stored lock. */
  async release(token: string): Promise<boolean> {
    const key = await this.cache.get<string>(this.tokenKey(token));
    if (!key) return false;
    const lock = await this.cache.get<StoredLock>(key);
    await this.cache.del(this.tokenKey(token));
    if (lock && lock.token === token) {
      await this.cache.del(key);
      return true;
    }
    return false;
  }

  /** Time ranges locked by users other than `userId` at any of the given slot starts. */
  async othersLocked(
    doctorId: string,
    starts: Date[],
    userId: string,
  ): Promise<{ startsAt: Date; endsAt: Date }[]> {
    const found = await Promise.all(starts.map((s) => this.get(doctorId, s)));
    const ranges: { startsAt: Date; endsAt: Date }[] = [];
    found.forEach((lock, i) => {
      if (lock && lock.userId !== userId) {
        const startsAt = starts[i]!;
        ranges.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + lock.durationMinutes * 60_000),
        });
      }
    });
    return ranges;
  }
}
