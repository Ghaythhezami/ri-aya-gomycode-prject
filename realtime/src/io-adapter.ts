import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { Env } from './config/env';
import { RedisClientsService } from './redis/redis-clients.service';

/** 16 KB, so an oversized frame is refused by the transport (EC-007). */
const MAX_BUFFER_BYTES = 16 * 1024;

type AdapterClient = Parameters<typeof createAdapter>[0];

const asAdapterClient = (client: Redis): AdapterClient => client as unknown as AdapterClient;

/**
 * Creates the Socket.IO server with the validated environment and installs the
 * Redis adapter (FR-002, FR-006).
 *
 * This lives in an adapter rather than in the `@WebSocketGateway` options
 * because the options are evaluated as decorator metadata, before Nest has
 * resolved `ENV` - a decorator cannot read the allow-list.
 */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly env: Env,
    private readonly redis: RedisClientsService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.env.corsOrigins },
      maxHttpBufferSize: MAX_BUFFER_BYTES,
    });

    server.adapter(
      createAdapter(asAdapterClient(this.redis.publisher), asAdapterClient(this.redis.subscriber)),
    );

    return server;
  }
}
