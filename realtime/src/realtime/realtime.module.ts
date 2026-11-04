import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { ConnectThrottleService } from './connect-throttle.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * The Websocket server and its admission path. The adapter itself is built in
 * `main.ts` (see `ConfiguredIoAdapter`), because it needs the validated
 * environment, which a decorator cannot read.
 */
@Module({
  imports: [AuthModule, RedisModule],
  providers: [ConnectThrottleService, RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
