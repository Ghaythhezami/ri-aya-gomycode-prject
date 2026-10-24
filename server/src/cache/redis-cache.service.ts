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
}
