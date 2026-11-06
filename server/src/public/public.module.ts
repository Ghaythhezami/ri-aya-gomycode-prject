import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { PublicController } from './public.controller';

@Module({
  imports: [QueueModule],
  controllers: [PublicController],
})
export class PublicModule {}
