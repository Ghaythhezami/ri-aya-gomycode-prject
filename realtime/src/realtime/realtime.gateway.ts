import { Logger, OnApplicationShutdown } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  ConnectionRefusedError,
  ConnectionScope,
  TokenService,
  UNAUTHORIZED_REASON,
} from '../auth/token.service';
import { ConnectThrottleService } from './connect-throttle.service';
import { clinicRoom, extractToken, userRoom } from './socket-scope';

/**
 * `setTimeout` overflows above 2^31-1 ms and fires immediately, so a long-lived
 * token would disconnect the socket the moment it connected.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const joinRequestSchema = z.object({ room: z.string().min(1).max(200) }).strict();

/** Client-visible refusal for a room the connection may not join (AC-004). */
const ROOM_DENIED = 'ROOM_DENIED';

/**
 * The only socket surface in v1 (FR-002, FR-004, FR-005).
 *
 * Admission runs in the namespace middleware rather than in `handleConnection`:
 * a middleware that calls `next(new Error(...))` produces the `connect_error`
 * AC-001 requires, whereas throwing from `handleConnection` emits the generic
 * `exception` event after the client believes it is connected.
 */
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly throttle: ConnectThrottleService,
  ) {}

  /** Exposed so the relay emits through the same server the adapter was set on. */
  get io(): Server {
    return this.server;
  }

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.admit(socket)
        .then(() => next())
        .catch((error: unknown) => {
          if (!(error instanceof ConnectionRefusedError)) {
            this.logger.error('handshake failed unexpectedly');
          }

          next(new Error(UNAUTHORIZED_REASON));
        });
    });
  }

  private async admit(socket: Socket): Promise<void> {
    if (!(await this.throttle.consume(socket.handshake.address))) {
      this.logger.warn('handshake refused: connection attempts exceeded');
      throw new ConnectionRefusedError();
    }

    socket.data.scope = await this.tokens.verify(extractToken(socket.handshake));
  }

  handleConnection(socket: Socket): void {
    const scope = socket.data.scope as ConnectionScope | undefined;

    if (!scope) {
      // Defensive: the middleware always sets this, so a socket without a scope
      // never receives an event.
      socket.disconnect(true);
      return;
    }

    void socket.join(userRoom(scope.userId));
    void socket.join(clinicRoom(scope.clinicId));

    socket.on('room:join', (payload: unknown) => this.handleJoin(socket, payload));

    this.armExpiry(socket, scope.expiresAt);
  }

  handleDisconnect(socket: Socket): void {
    const timer = socket.data.expiryTimer as NodeJS.Timeout | undefined;

    if (timer) {
      clearTimeout(timer);
      socket.data.expiryTimer = undefined;
    }
  }

  onApplicationShutdown(): void {
    try {
      this.server?.close();
    } catch {
      // Shutting down: a closed server is the desired end state.
    }
  }

  /**
   * Accepts a room only when it is one this connection already owns (FR-005).
   *
   * An owned room is a no-op rather than an error (EC-008); anything else is
   * refused and no membership is added. The room name is not echoed back, so a
   * client cannot use the refusal as an oracle for tenant ids.
   */
  private handleJoin(socket: Socket, payload: unknown): void {
    const scope = socket.data.scope as ConnectionScope | undefined;

    if (!scope) {
      return;
    }

    const parsed = joinRequestSchema.safeParse(payload);

    if (!parsed.success) {
      socket.emit('room:denied', { reason: ROOM_DENIED });
      return;
    }

    const owned = [userRoom(scope.userId), clinicRoom(scope.clinicId)];

    if (!owned.includes(parsed.data.room)) {
      this.logger.warn('room join refused: the request is outside the connection scope');
      socket.emit('room:denied', { reason: ROOM_DENIED });
      return;
    }

    void socket.join(parsed.data.room);
  }

  /** Disconnect exactly when the credential stops being valid (AC-007, EC-002). */
  private armExpiry(socket: Socket, expiresAt: number): void {
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      socket.disconnect(true);
      return;
    }

    const delay = Math.min(remaining, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      if (delay < remaining) {
        this.armExpiry(socket, expiresAt);
        return;
      }

      this.logger.log('disconnecting socket: the access token expired');
      socket.disconnect(true);
    }, delay);

    timer.unref();
    socket.data.expiryTimer = timer;
  }
}
