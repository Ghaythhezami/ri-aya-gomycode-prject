import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { REALTIME_EVENTS_CHANNEL, realtimeEventSchema } from '@riaya/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { clinicRoom } from '../realtime/socket-scope';
import { RedisClientsService } from '../redis/redis-clients.service';

/**
 * Relays domain events from Redis to the clinic room (FR-008, FR-009).
 *
 * The envelope is emitted exactly as published - the event name is the one it
 * carried and the payload is untouched (AC-011). Validation happens before the
 * emit, never as a transform.
 */
@Injectable()
export class EventRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventRelayService.name);

  private readonly onMessage = (channel: string, raw: string): void => {
    if (channel === REALTIME_EVENTS_CHANNEL) {
      void this.relay(raw);
    }
  };

  /**
   * Re-subscribe on every `ready`. ioredis restores *existing* subscriptions
   * after a reconnect but cannot restore one that never succeeded, which is the
   * case when the service boots before Redis (AC-010, EC-010).
   */
  private readonly onReady = (): void => {
    void this.subscribe();
  };

  constructor(
    private readonly redis: RedisClientsService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis.events.on('message', this.onMessage);
    this.redis.events.on('ready', this.onReady);

    if (this.redis.events.status === 'ready') {
      await this.subscribe();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.events.off('message', this.onMessage);
    this.redis.events.off('ready', this.onReady);

    try {
      await this.redis.events.unsubscribe(REALTIME_EVENTS_CHANNEL);
    } catch {
      // Closing anyway.
    }
  }

  private async subscribe(): Promise<void> {
    try {
      await this.redis.events.subscribe(REALTIME_EVENTS_CHANNEL);
      this.logger.log(`subscribed to ${REALTIME_EVENTS_CHANNEL}`);
    } catch (error) {
      this.logger.warn(
        `subscription deferred until Redis reconnects: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  private async relay(raw: string): Promise<void> {
    let decoded: unknown;

    try {
      decoded = JSON.parse(raw);
    } catch {
      this.logger.warn(`${REALTIME_EVENTS_CHANNEL}: dropped a message that is not JSON`);
      return;
    }

    const parsed = realtimeEventSchema.safeParse(decoded);

    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.join('.') || '(root)';
      this.logger.warn(
        `${REALTIME_EVENTS_CHANNEL}: dropped an invalid event, failing field ${field}`,
      );
      return;
    }

    const event = parsed.data;
    const room = clinicRoom(event.clinicId);

    // Every instance subscribes to riaya:events, so every instance relays this
    // event. The emit must therefore be LOCAL: a cluster-wide emit would be
    // fanned out by the Redis adapter as well, and a client in the room would
    // receive one copy per instance (observed as duplicate deliveries).
    //
    // It is also emitted unconditionally. Emitting to a room with no members is
    // a no-op, so gating the emit on a cluster-wide lookup bought nothing and
    // cost a round-trip per event - which stalled delivery for the adapter's
    // whole 5s timeout whenever a peer did not answer.
    const heard = this.gateway.io.of('/').adapter.rooms.has(room);

    this.gateway.io.to(room).local.emit(event.event, event);

    if (!heard) {
      this.logger.debug(`${event.event}: no listeners in the target room`);
    }
  }
}
