import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { REALTIME_EVENTS_CHANNEL } from '@riaya/shared';
import { DomainEventsService, READY_WAIT_MS } from './domain-events.service';

class FakeRedis extends EventEmitter {
  status = 'connecting';
  publish = jest.fn().mockResolvedValue(1);
  disconnect = jest.fn();
}

const build = (redis: FakeRedis | null) => {
  const service = new DomainEventsService({ get: () => undefined } as unknown as ConfigService);
  Object.assign(service, { publisher: redis });
  return service;
};

const queueEvent = {
  type: 'queue.updated',
  clinicId: 'clinic-1',
  payload: { date: '2026-11-06', waiting: 2, inProgress: 1, completed: 4 },
} as never;

describe('DomainEventsService realtime publish', () => {
  afterEach(() => jest.useRealTimers());

  it('publishes straight away when Redis is ready', async () => {
    const redis = new FakeRedis();
    redis.status = 'ready';
    const service = build(redis);

    await service.emit(queueEvent);
    await service.flush();

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = redis.publish.mock.calls[0] as [string, string];
    expect(channel).toBe(REALTIME_EVENTS_CHANNEL);
    expect(JSON.parse(raw)).toMatchObject({ event: 'queue.updated', clinicId: 'clinic-1' });
  });

  it('waits for Redis to become ready (cold start) instead of dropping the event', async () => {
    const redis = new FakeRedis();
    const service = build(redis);

    await service.emit(queueEvent); // does not block on the connection
    expect(redis.publish).not.toHaveBeenCalled();

    redis.status = 'ready';
    redis.emit('ready');
    await service.flush();

    expect(redis.publish).toHaveBeenCalledTimes(1);
  });

  it('gives up after 1 s without throwing and without publishing', async () => {
    jest.useFakeTimers();
    const redis = new FakeRedis();
    const service = build(redis);

    await service.emit(queueEvent);
    await jest.advanceTimersByTimeAsync(READY_WAIT_MS + 10);
    await service.flush();

    expect(redis.publish).not.toHaveBeenCalled();
    expect(redis.listenerCount('ready')).toBe(0);
  });

  it('keeps a failing publish non-fatal', async () => {
    const redis = new FakeRedis();
    redis.status = 'ready';
    redis.publish.mockRejectedValue(new Error('boom'));
    const service = build(redis);

    await expect(service.emit(queueEvent)).resolves.toBeUndefined();
    await expect(service.flush()).resolves.toBeUndefined();
  });

  it('still runs handlers and does nothing without a publisher', async () => {
    const service = build(null);
    const handler = jest.fn();
    service.on('queue.updated', handler);

    await service.emit(queueEvent);
    await service.flush();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('publishes the internal membership events with only the user id', async () => {
    const redis = new FakeRedis();
    redis.status = 'ready';
    const service = build(redis);

    for (const type of ['membership.suspended', 'membership.role_changed']) {
      await service.emit({
        type,
        clinicId: 'clinic-1',
        payload: { userId: 'user-9', email: 'x@example.test' },
      } as never);
    }
    await service.flush();

    expect(redis.publish).toHaveBeenCalledTimes(2);
    const wire = JSON.parse((redis.publish.mock.calls[0] as [string, string])[1]);
    expect(wire).toMatchObject({
      event: 'membership.suspended',
      clinicId: 'clinic-1',
      payload: { userId: 'user-9' },
    });
    expect(Object.keys(wire.payload)).toEqual(['userId']);
  });

  it('does not publish a membership event without a user id', async () => {
    const redis = new FakeRedis();
    redis.status = 'ready';
    const service = build(redis);

    await service.emit({ type: 'membership.suspended', clinicId: 'c', payload: {} } as never);
    await service.flush();

    expect(redis.publish).not.toHaveBeenCalled();
  });
});
