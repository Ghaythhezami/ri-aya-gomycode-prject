import { Module } from '@nestjs/common';
import { MongoModule } from '../database/mongo.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, MongoModule],
  controllers: [HealthController],
})
export class HealthModule {}
