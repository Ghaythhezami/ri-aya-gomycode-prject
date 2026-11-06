import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REALTIME_CONTRACT_VERSION, REALTIME_EVENTS_CHANNEL } from '@riaya/shared';
import type { DomainEvent, DomainEventType } from './domain-events';

/** Longest a publish waits for the Redis connection to become ready. */
export const READY_WAIT_MS = 1_000;

/** Internal events published on the channel for riaya-comms only (not in the public contract). */
const INTERNAL_EVENTS: ReadonlySet<string> = new Set([
  'membership.suspended',
  'membership.role_changed',
]);

type Handler = (event: DomainEvent) => void | Promise<void>;

/**
 * A tiny synchronous-dispatch, async-tolerant event bus.
 *
 * `emit` never throws to the producer: a failing consumer is logged, not
 * propagated, because the producer's transaction has already committed.
 * When REDIS_URL is set the four contract events are also published on
 * `riaya:events` for the realtime service (packages/shared/src/schemas/realtime.ts).
 */
@Injectable()
export class DomainEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly handlers = new Map<DomainEventType | '*', Handler[]>();
  private readonly publisher: Redis | null;
  private readonly inflight = new Set<Promise<void>>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    this.publisher =
      url && process.env.NODE_ENV !== 'test'
        ? new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
        : null;
    this.publisher?.connect().catch(() => undefined);
    this.publisher?.on('error', () => undefined);
  }

  on(type: DomainEventType | '*', handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  /** Fire-and-forget. Returns a promise that settles when every handler ran (tests await it). */
  async emit(event: Omit<DomainEvent, 'occurredAt'> & { occurredAt?: Date }): Promise<void> {
    const full: DomainEvent = { ...event, occurredAt: event.occurredAt ?? new Date() };
    const handlers = [...(this.handlers.get(full.type) ?? []), ...(this.handlers.get('*') ?? [])];
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(full);
        } catch (error) {
          this.logger.warn(`Handler for ${full.type} failed: ${(error as Error).message}`);
        }
      }),
    );
    // Fire-and-forget: the request path never waits for Redis (see `flush`).
    this.track(this.publishRealtime(full));
  }

  /** Resolves when every realtime publish started so far has settled (tests, shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.inflight]);
  }

  private track(work: Promise<void>): void {
    this.inflight.add(work);
    void work.finally(() => this.inflight.delete(work));
  }

  /**
   * A cold serverless start emits before ioredis finished connecting; wait up to
   * READY_WAIT_MS for it instead of dropping the event. Never throws.
   */
  private async waitUntilReady(): Promise<boolean> {
    const publisher = this.publisher;
    if (!publisher) return false;
    if (publisher.status === 'ready') return true;
    if (publisher.status === 'end') return false;
    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean): void => {
        clearTimeout(timer);
        publisher.off('ready', onReady);
        resolve(ok);
      };
      const onReady = (): void => done(true);
      const timer = setTimeout(() => done(false), READY_WAIT_MS);
      publisher.once('ready', onReady);
    });
  }

  private async publishRealtime(event: DomainEvent): Promise<void> {
    try {
      await this.publishWire(event);
    } catch (error) {
      this.logger.debug(`Realtime publish skipped: ${(error as Error).message}`);
    }
  }

  private async publishWire(event: DomainEvent): Promise<void> {
    if (!this.publisher) return;
    const p = event.payload;
    let wire: Record<string, unknown> | null = null;
    const base = {
      contractVersion: REALTIME_CONTRACT_VERSION,
      clinicId: event.clinicId,
      occurredAt: event.occurredAt.toISOString(),
    };
    if (event.type === 'appointment.created') {
      wire = {
        event: 'appointment.created',
        ...base,
        payload: {
          appointmentId: String(p.appointmentId),
          doctorId: String(p.doctorId),
          startsAt: String(p.startsAt),
          durationMinutes: Number(p.durationMinutes),
          status: p.status === 'CONFIRMED' ? 'CONFIRMED' : 'SCHEDULED',
        },
      };
    } else if (event.type === 'appointment.cancelled') {
      wire = {
        event: 'appointment.cancelled',
        ...base,
        payload: {
          appointmentId: String(p.appointmentId),
          cancelledAt: event.occurredAt.toISOString(),
          ...(p.reason ? { reason: String(p.reason).slice(0, 500) } : {}),
        },
      };
    } else if (event.type === 'appointment.rescheduled') {
      wire = {
        event: 'appointment.rescheduled',
        ...base,
        payload: {
          appointmentId: String(p.appointmentId),
          fromStartsAt: String(p.fromStartsAt),
          toStartsAt: String(p.toStartsAt),
          durationMinutes: Number(p.durationMinutes),
        },
      };
    } else if (event.type === 'queue.updated') {
      wire = {
        event: 'queue.updated',
        ...base,
        payload: {
          date: String(p.date),
          waiting: Number(p.waiting ?? 0),
          inProgress: Number(p.inProgress ?? 0),
          completed: Number(p.completed ?? 0),
        },
      };
    } else if (INTERNAL_EVENTS.has(event.type as string) && typeof p.userId === 'string') {
      // Consumed by riaya-comms to drop that user's sockets; never relayed to browsers.
      wire = {
        event: event.type,
        ...base,
        payload: { userId: p.userId },
      };
    }
    if (!wire) return;
    if (!(await this.waitUntilReady())) {
      this.logger.debug(`Realtime publish skipped: Redis not ready after ${READY_WAIT_MS} ms`);
      return;
    }
    await this.publisher.publish(REALTIME_EVENTS_CHANNEL, JSON.stringify(wire));
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
  }
}
