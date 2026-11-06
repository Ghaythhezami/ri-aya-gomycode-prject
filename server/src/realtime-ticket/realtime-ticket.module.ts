import { Module } from '@nestjs/common';
import { RealtimeTicketController } from './realtime-ticket.controller';
import { RealtimeTicketService } from './realtime-ticket.service';

@Module({
  controllers: [RealtimeTicketController],
  providers: [RealtimeTicketService],
})
export class RealtimeTicketModule {}
