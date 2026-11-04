import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { MongoConnectionService } from '../database/mongo-connection.service';
import { RedisClientsService } from '../redis/redis-clients.service';

/**
 * Liveness and readiness (FR-011).
 *
 * `/health/live` answers without touching a dependency: a process that can
 * answer is alive, and a Mongo outage must not trigger a restart loop on a
 * working socket server (AC-015).
 *
 * `/health/ready` names each dependency separately. The two failure modes are
 * deliberately different:
 * - Redis down -> 200 `degraded`. Sockets still work on this instance and the
 *   adapter self-heals, so taking the pod out of rotation would be worse
 *   (AC-009).
 * - Mongo down -> 503 `degraded`. No collection exists, so sockets still work,
 *   but an unreachable database is a configuration error a deploy should see
 *   (AC-016).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly redis: RedisClientsService,
    private readonly mongo: MongoConnectionService,
  ) {}

  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  ready(): {
    status: 'ok' | 'degraded';
    dependencies: { redis: 'up' | 'down'; mongo: 'up' | 'down' };
    timestamp: string;
  } {
    const redis = this.redis.status;
    const mongo = this.mongo.status;
    const body = {
      status: redis === 'up' && mongo === 'up' ? ('ok' as const) : ('degraded' as const),
      dependencies: { redis, mongo },
      timestamp: new Date().toISOString(),
    };

    if (mongo !== 'up') {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }
}
