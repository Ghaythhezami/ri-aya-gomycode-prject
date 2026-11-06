import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit';
import { QueueService } from '../queue/queue.service';
import { SelfCheckInDto } from '../queue/queue.dto';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** Unauthenticated waiting-room endpoints. They never read TenantContext. */
@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly queue: QueueService) {}

  @Get('display/:clinicId')
  display(@Param('clinicId', uuidPipe) clinicId: string) {
    return this.queue.publicDisplay(clinicId);
  }

  @Post('check-in/:clinicId')
  @HttpCode(200)
  @RateLimit(10)
  checkIn(@Param('clinicId', uuidPipe) clinicId: string, @Body() dto: SelfCheckInDto) {
    return this.queue.selfCheckIn(clinicId, dto.appointmentCode, dto.phoneLast4);
  }
}
