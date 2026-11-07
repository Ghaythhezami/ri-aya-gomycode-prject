import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get the public waiting-room display',
    description: 'Public, no authentication. Queue numbers and rooms only, no personal data.',
  })
  @ApiOkResponse({ description: 'PublicDisplay' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  display(@Param('clinicId', uuidPipe) clinicId: string) {
    return this.queue.publicDisplay(clinicId);
  }

  @Post('check-in/:clinicId')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({
    summary: 'Self check-in with appointment code',
    description:
      'Public, no authentication. Rate limited; verified by appointment code and the last four digits of the phone.',
  })
  @ApiOkResponse({ description: 'SelfCheckInResult' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  checkIn(@Param('clinicId', uuidPipe) clinicId: string, @Body() dto: SelfCheckInDto) {
    return this.queue.selfCheckIn(clinicId, dto.appointmentCode, dto.phoneLast4);
  }
}
