import { Module } from '@nestjs/common';
import { RedisClientsService } from './redis-clients.service';

@Module({
  providers: [RedisClientsService],
  exports: [RedisClientsService],
})
export class RedisModule {}
