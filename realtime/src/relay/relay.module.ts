import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisModule } from '../redis/redis.module';
import { EventRelayService } from './event-relay.service';

@Module({
  imports: [RealtimeModule, RedisModule],
  providers: [EventRelayService],
})
export class RelayModule {}
