import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommsSyncService } from './comms-sync.service';
import { ServiceClient } from './service-client';

import { COMMS_CLIENT, SCHEDULER_CLIENT } from './service-tokens';

export { COMMS_CLIENT, SCHEDULER_CLIENT };

/**
 * Clients for `riaya-scheduler` and `riaya-comms`. Each is disabled unless its URL is set
 * (`SCHEDULER_URL`, `COMMS_URL`), in which case `SERVICE_JWT_SECRET` must be 32+ characters and
 * a missing secret fails the boot instead of the first request.
 */
@Global()
@Module({
  providers: [
    {
      provide: SCHEDULER_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new ServiceClient({
          audience: 'riaya-scheduler',
          baseUrl: config.get<string>('SCHEDULER_URL'),
          secret: config.get<string>('SERVICE_JWT_SECRET'),
          timeoutMs: Number(config.get<string>('SCHEDULER_TIMEOUT_MS') ?? 3_000),
        }),
    },
    {
      provide: COMMS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new ServiceClient({
          audience: 'riaya-comms',
          baseUrl: config.get<string>('COMMS_URL'),
          secret: config.get<string>('SERVICE_JWT_SECRET'),
          timeoutMs: Number(config.get<string>('COMMS_TIMEOUT_MS') ?? 3_000),
        }),
    },
    CommsSyncService,
  ],
  exports: [SCHEDULER_CLIENT, COMMS_CLIENT, CommsSyncService],
})
export class ServicesModule {}
