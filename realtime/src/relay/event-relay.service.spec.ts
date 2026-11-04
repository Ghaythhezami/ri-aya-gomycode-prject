import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { REALTIME_EVENTS_CHANNEL } from '@riaya/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisClientsService } from '../redis/redis-clients.service';
import { EventRelayService } from './event-relay.service';

type Status = 'ready' | 'wait';

class FakeEvents extends EventEmitter {
  status: Status = 'ready';
  subscribe = jest.fn().mockResolvedValue(1);
  unsubscribe = jest.fn().mockResolvedValue(1);
}

const buildIo = () => {
  const localEmit = jest.fn();
  const clusterEmit = jest.fn();
  const rooms = new Map<string, Set<string>>();
  const to = jest.fn(() => ({ local: { emit: localEmit }, emit: clusterEmit }));
  const io = { to, of: jest.fn(() => ({ adapter: { rooms } })) };

  return { io, to, localEmit, clusterEmit, rooms };
};

const build = (status: Status = 'ready') => {
  const events = new FakeEvents();
  events.status = status;
  const redis = { events } as unknown as RedisClientsService;
  const { io, to, localEmit, clusterEmit, rooms } = buildIo();
  const gateway = { io } as unknown as RealtimeGateway;
  const service = new EventRelayService(redis, gateway);

  return { service, events, to, localEmit, clusterEmit, rooms };
};

const envelope = (clinicId = 'clinic-1', appointmentId = 'apt-1') => ({
  event: 'appointment.created',
  contractVersion: 1,
  clinicId,
  occurredAt: new Date().toISOString(),
  payload: {
    appointmentId,
    doctorId: 'doctor-1',
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    durationMinutes: 30,
    status: 'SCHEDULED',
  },
});

/** Publishes on the fake subscriber and lets the relay's promise settle. */
const publish = async (events: FakeEvents, raw: unknown): Promise<void> => {
  events.emit('message', REALTIME_EVENTS_CHANNEL, JSON.stringify(raw));
  await new Promise((resolve) => setImmediate(resolve));
};

describe('EventRelayService', () => {
  afterEach(() => jest.restoreAllMocks());

  // TEST-011 → AC-011
  it('TEST-011/AC-011: a valid event is forwarded unchanged under its own name', async () => {
    const { service, events, localEmit } = build();
    await service.onModuleInit();
    const event = envelope();

    await publish(events, event);

    expect(localEmit).toHaveBeenCalledTimes(1);
    expect(localEmit).toHaveBeenCalledWith('appointment.created', event);
  });

  // TEST-008 → AC-008
  it('TEST-008/AC-008: delivery uses the local operator so a client is not sent one copy per instance', async () => {
    const { service, events, to, localEmit, clusterEmit } = build();
    await service.onModuleInit();

    await publish(events, envelope());

    expect(to).toHaveBeenCalledWith('clinic:clinic-1');
    expect(localEmit).toHaveBeenCalledTimes(1);
    expect(clusterEmit).not.toHaveBeenCalled();
  });

  // TEST-005 → AC-005
  it('TEST-005/AC-005: an event is addressed only to the clinic room it names', async () => {
    const { service, events, to } = build();
    await service.onModuleInit();

    await publish(events, envelope('clinic-2'));

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('clinic:clinic-2');
  });

  // TEST-012 → AC-012
  it('TEST-012/AC-012: an invalid payload is dropped and logged with its failing field', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, events, localEmit } = build();
    await service.onModuleInit();
    const invalid = envelope();
    invalid.payload.startsAt = 'not-a-date';

    await publish(events, invalid);

    expect(localEmit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(REALTIME_EVENTS_CHANNEL));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('payload.startsAt'));
  });

  // TEST-012 → AC-012
  it('TEST-012/AC-012: the relay keeps running after a dropped payload', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, events, localEmit } = build();
    await service.onModuleInit();

    await publish(events, { ...envelope(), contractVersion: 99 });
    await publish(events, envelope('clinic-1', 'apt-2'));

    expect(localEmit).toHaveBeenCalledTimes(1);
    expect(localEmit).toHaveBeenCalledWith(
      'appointment.created',
      expect.objectContaining({ payload: expect.objectContaining({ appointmentId: 'apt-2' }) }),
    );
  });

  it('TEST-012/AC-012: a message that is not JSON is dropped without throwing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, events, localEmit } = build();
    await service.onModuleInit();

    events.emit('message', REALTIME_EVENTS_CHANNEL, 'not-json{');
    await new Promise((resolve) => setImmediate(resolve));

    expect(localEmit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not JSON'));
  });

  // TEST-013 → AC-013
  it('TEST-013/AC-013: an event for a clinic with no listeners is dropped and logged', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const { service, events, localEmit, rooms } = build();
    await service.onModuleInit();

    await publish(events, envelope());
    await new Promise((resolve) => setImmediate(resolve));

    expect(rooms.size).toBe(0);
    expect(localEmit).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('no listeners'));
  });

  // TEST-010 → AC-010
  it('TEST-010/AC-010: the relay subscribes once Redis reports ready after a late start', async () => {
    const { service, events } = build('wait');

    await service.onModuleInit();
    expect(events.subscribe).not.toHaveBeenCalled();

    events.status = 'ready';
    events.emit('ready');
    await new Promise((resolve) => setImmediate(resolve));

    expect(events.subscribe).toHaveBeenCalledWith(REALTIME_EVENTS_CHANNEL);
  });

  it('TEST-010/AC-010: an already-connected subscriber is subscribed at startup', async () => {
    const { service, events } = build('ready');

    await service.onModuleInit();

    expect(events.subscribe).toHaveBeenCalledWith(REALTIME_EVENTS_CHANNEL);
  });

  it('TEST-010/AC-010: a failed subscribe is retried on the next ready event', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, events } = build('ready');
    events.subscribe.mockRejectedValueOnce(new Error('connection lost'));

    await service.onModuleInit();
    events.emit('ready');
    await new Promise((resolve) => setImmediate(resolve));

    expect(events.subscribe).toHaveBeenCalledTimes(2);
  });

  it('TEST-010/AC-010: shutdown detaches the listeners and unsubscribes', async () => {
    const { service, events } = build('ready');
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(events.unsubscribe).toHaveBeenCalledWith(REALTIME_EVENTS_CHANNEL);
    expect(events.listenerCount('message')).toBe(0);
    expect(events.listenerCount('ready')).toBe(0);
  });
});
