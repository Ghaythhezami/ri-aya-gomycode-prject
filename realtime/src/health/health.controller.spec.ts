import { ServiceUnavailableException } from '@nestjs/common';
import { MongoConnectionService } from '../database/mongo-connection.service';
import { RedisClientsService } from '../redis/redis-clients.service';
import { HealthController } from './health.controller';

const build = (redis: 'up' | 'down', mongo: 'up' | 'down'): HealthController =>
  new HealthController(
    { status: redis } as unknown as RedisClientsService,
    { status: mongo } as unknown as MongoConnectionService,
  );

const readinessBody = (mongo: 'up' | 'down'): Record<string, unknown> => {
  try {
    return build('up', mongo).ready() as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      return error.getResponse() as Record<string, unknown>;
    }

    throw error;
  }
};

describe('HealthController', () => {
  // TEST-015 → AC-015
  it('AC-015: liveness answers without consulting a dependency', () => {
    const controller = build('down', 'down');

    expect(controller.live()).toEqual({ status: 'ok', timestamp: expect.any(String) });
  });

  // TEST-009 → AC-009
  it('AC-009: readiness reports degraded, not failure, when only Redis is down', () => {
    const controller = build('down', 'up');

    const body = controller.ready();

    expect(body.status).toBe('degraded');
    expect(body.dependencies).toEqual({ redis: 'down', mongo: 'up' });
  });

  it('AC-009: readiness is ok when every dependency answers', () => {
    const body = build('up', 'up').ready();

    expect(body.status).toBe('ok');
    expect(body.dependencies).toEqual({ redis: 'up', mongo: 'up' });
  });

  // TEST-016 → AC-016
  it('AC-016: readiness fails with 503 and names Mongo when Mongo is unreachable', () => {
    const controller = build('up', 'down');

    expect(() => controller.ready()).toThrow(ServiceUnavailableException);

    const body = readinessBody('down');
    expect(body.status).toBe('degraded');
    expect(body.dependencies).toEqual({ redis: 'up', mongo: 'down' });
  });
});
