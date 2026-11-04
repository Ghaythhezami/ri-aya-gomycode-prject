import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { DependencyStatus } from '../common/dependency-status';
import { ENV, Env } from '../config/env';

/**
 * The three Redis connections this service needs (FR-006, T4.1).
 *
 * - `publisher` speaks normal commands; the adapter publishes through it.
 * - `subscriber` exists because a client in subscriber mode cannot issue normal
 *   commands, and the adapter needs its own subscription.
 * - `events` is a third subscriber for `riaya:events`, so the relay and the
 *   adapter never share a subscription.
 *
 * All three are lazy and retry forever with a capped backoff. That is what lets
 * the service start while Redis is down and recover without a restart
 * (FR-007, EC-010).
 */
@Injectable()
export class RedisClientsService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisClientsService.name);
  private readonly reportedDown = new Set<string>();

  readonly publisher: Redis;
  readonly subscriber: Redis;
  readonly events: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.publisher = this.create(env.redisUrl, 'publisher');
    this.subscriber = this.publisher.duplicate();
    this.events = this.publisher.duplicate();

    this.watch(this.subscriber, 'subscriber');
    this.watch(this.events, 'events');

    for (const client of [this.publisher, this.subscriber, this.events]) {
      client.connect().catch(() => {
        // The `error`/`ready` handlers report the state; retries continue.
      });
    }
  }

  /** `up` only on a live connection, which is what readiness reports (FR-011). */
  get status(): DependencyStatus {
    return this.publisher.status === 'ready' ? 'up' : 'down';
  }

  onModuleDestroy(): void {
    for (const client of [this.publisher, this.subscriber, this.events]) {
      try {
        client.disconnect();
      } catch {
        // Already closed.
      }
    }
  }

  private create(url: string, name: string): Redis {
    const client = new Redis(url, {
      lazyConnect: true,
      // Commands wait through a reconnect instead of failing with "max retries
      // per request" while the adapter is recovering.
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    client.on('error', (error: Error) => {
      if (!this.reportedDown.has(name)) {
        this.logger.warn(`Redis ${name} unavailable: ${error.message}`);
        this.reportedDown.add(name);
      }
    });

    return client;
  }

  private watch(client: Redis, name: string): void {
    client.on('ready', () => {
      this.reportedDown.delete(name);
      this.logger.log(`Redis ${name} connected`);
    });
  }
}
