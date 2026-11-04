import { Logger } from '@nestjs/common';
import { ConnectionRefusedError, ConnectionScope, TokenService } from '../auth/token.service';
import { ConnectThrottleService } from './connect-throttle.service';
import { RealtimeGateway } from './realtime.gateway';

const scope = (overrides: Partial<ConnectionScope> = {}): ConnectionScope => ({
  userId: 'user-1',
  clinicId: 'clinic-1',
  role: 'RECEPTIONIST',
  expiresAt: Date.now() + 900_000,
  ...overrides,
});

interface FakeSocket {
  handshake: { address: string; auth: Record<string, unknown>; headers: Record<string, string> };
  data: Record<string, unknown>;
  join: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  handlers: Map<string, (payload: unknown) => void>;
}

const fakeSocket = (
  auth: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): FakeSocket => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket: FakeSocket = {
    handshake: { address: '203.0.113.9', auth, headers },
    data: {},
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    }),
    handlers,
  };

  return socket;
};

const build = (verified: ConnectionScope | Error, allowed = true) => {
  const tokens = {
    verify: jest.fn(() =>
      verified instanceof Error ? Promise.reject(verified) : Promise.resolve(verified),
    ),
  } as unknown as TokenService;
  const throttle = {
    consume: jest.fn().mockResolvedValue(allowed),
  } as unknown as ConnectThrottleService;

  return { gateway: new RealtimeGateway(tokens, throttle), tokens, throttle };
};

const middlewareFor = (gateway: RealtimeGateway): ((socket: unknown, next: jest.Mock) => void) => {
  const use = jest.fn();

  gateway.afterInit({ use } as never);

  return use.mock.calls[0][0] as (socket: unknown, next: jest.Mock) => void;
};

/** Runs the admission middleware and resolves with whatever it passed to `next`. */
const admit = async (gateway: RealtimeGateway, socket: FakeSocket): Promise<Error | undefined> => {
  const next = jest.fn();

  middlewareFor(gateway)(socket, next);

  // Flush microtasks only: the admission chain is promise-based, and a
  // macrotask would hang under fake timers.
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }

  return next.mock.calls[0]?.[0] as Error | undefined;
};

describe('RealtimeGateway', () => {
  // TEST-001 → AC-001
  it('AC-001: a connection with no token is refused and joins nothing', async () => {
    const tokens = {
      verify: jest.fn().mockRejectedValue(new ConnectionRefusedError()),
    } as unknown as TokenService;
    const throttle = {
      consume: jest.fn().mockResolvedValue(true),
    } as unknown as ConnectThrottleService;
    const gateway = new RealtimeGateway(tokens, throttle);
    const socket = fakeSocket();

    const error = await admit(gateway, socket);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('UNAUTHORIZED');
    expect(socket.join).not.toHaveBeenCalled();
  });

  // TEST-002 → AC-002
  it('AC-002: every admission failure reaches the client as the same reason', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const refused = await admit(build(new ConnectionRefusedError()).gateway, fakeSocket());
    const unexpected = await admit(build(new Error('jwt malformed')).gateway, fakeSocket());

    expect(refused?.message).toBe('UNAUTHORIZED');
    expect(unexpected?.message).toBe('UNAUTHORIZED');
    expect(refused?.message).toBe(unexpected?.message);

    jest.restoreAllMocks();
  });

  // TEST-002 → AC-001
  it('AC-001: a throttled connection attempt is refused before authentication', async () => {
    const { gateway } = build(scope(), false);
    const socket = fakeSocket({ token: 'anything' });

    const error = await admit(gateway, socket);

    expect(error?.message).toBe('UNAUTHORIZED');
    expect(socket.join).not.toHaveBeenCalled();
  });

  // TEST-003 → AC-003
  it('AC-003: an accepted connection is bound to its user and clinic rooms', async () => {
    const { gateway } = build(scope());
    const socket = fakeSocket({ token: 'token' });

    expect(await admit(gateway, socket)).toBeUndefined();
    gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.join).toHaveBeenCalledWith('clinic:clinic-1');
    expect((socket.data.scope as ConnectionScope).userId).toBe('user-1');
  });

  // TEST-004 → AC-004
  it('AC-004: joining another clinic is refused and adds no membership', async () => {
    const { gateway } = build(scope());
    const socket = fakeSocket({ token: 'token' });

    await admit(gateway, socket);
    gateway.handleConnection(socket as never);
    socket.join.mockClear();

    socket.handlers.get('room:join')?.({ room: 'clinic:clinic-2' });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('room:denied', { reason: 'ROOM_DENIED' });
  });

  it('AC-004: re-joining a room the connection already owns is a silent no-op', async () => {
    const { gateway } = build(scope());
    const socket = fakeSocket({ token: 'token' });

    await admit(gateway, socket);
    gateway.handleConnection(socket as never);
    socket.emit.mockClear();
    socket.handlers.get('room:join')?.({ room: 'clinic:clinic-1' });

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('AC-004: a malformed join request is refused', async () => {
    const { gateway } = build(scope());
    const socket = fakeSocket({ token: 'token' });

    await admit(gateway, socket);
    gateway.handleConnection(socket as never);
    socket.handlers.get('room:join')?.({ room: '' });

    expect(socket.emit).toHaveBeenCalledWith('room:denied', { reason: 'ROOM_DENIED' });
  });

  // TEST-006 → AC-006
  it('AC-006: a reconnecting client is rejoined without any client-side join', async () => {
    const { gateway } = build(scope());
    const first = fakeSocket({ token: 'token' });
    const second = fakeSocket({ token: 'token' });

    await admit(gateway, first);
    gateway.handleConnection(first as never);
    await admit(gateway, second);
    gateway.handleConnection(second as never);

    for (const socket of [first, second]) {
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.join).toHaveBeenCalledWith('clinic:clinic-1');
    }
  });

  // TEST-007 → AC-007
  it('AC-007: the socket is disconnected when the token expires', async () => {
    jest.useFakeTimers();

    try {
      const { gateway } = build(scope({ expiresAt: Date.now() + 1_000 }));
      const socket = fakeSocket({ token: 'token' });

      await admit(gateway, socket);
      gateway.handleConnection(socket as never);
      expect(socket.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_000);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('AC-007: a connection whose token is already expired is disconnected at once', () => {
    const { gateway } = build(scope({ expiresAt: Date.now() - 1 }));
    const socket = fakeSocket({ token: 'token' });

    gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('AC-001: a socket that reaches the connection event without a scope is dropped', () => {
    const { gateway } = build(scope());
    const socket = fakeSocket();

    gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('AC-007: disconnecting clears the expiry timer', async () => {
    jest.useFakeTimers();

    try {
      const { gateway } = build(scope({ expiresAt: Date.now() + 1_000 }));
      const socket = fakeSocket({ token: 'token' });

      await admit(gateway, socket);
      gateway.handleConnection(socket as never);
      gateway.handleDisconnect(socket as never);
      jest.advanceTimersByTime(1_000);

      expect(socket.disconnect).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
