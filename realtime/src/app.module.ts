import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { MongoModule } from './database/mongo.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { RelayModule } from './relay/relay.module';

@Module({
  imports: [
    // The logger must exist before any module that logs during construction.
    LoggingModule,
    AppConfigModule,
    MongoModule,
    RedisModule,
    AuthModule,
    RealtimeModule,
    RelayModule,
    HealthModule,
  ],
})
export class AppModule {}
