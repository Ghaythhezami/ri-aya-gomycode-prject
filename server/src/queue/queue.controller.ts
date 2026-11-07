import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { QueueService } from './queue.service';
import { CallNextDto, CheckInDto, NotifyDelayDto, PriorityDto } from './queue.dto';

@ApiTags('queue')
@ApiBearerAuth()
@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('manageQueue')
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the live queue',
    description:
      'Waiting, called and in-consultation entries. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueSnapshot' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  snapshot() {
    return this.queue.snapshot(this.tenant.get().clinicId);
  }

  @Post('check-in')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a patient in at the desk',
    description: 'Adds an appointment to the queue. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  async checkIn(@Body() dto: CheckInDto) {
    const { clinicId, userId } = this.tenant.get();
    const { position: _position, ...entry } = await this.queue.checkIn({
      clinicId,
      appointmentId: dto.appointmentId,
      priority: dto.priority,
      source: 'DESK',
      actorUserId: userId,
    });
    void _position;
    return entry;
  }

  @Post('call-next')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Call the next patient',
    description:
      'Calls the next entry in queue order for a doctor. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  callNext(@Body() dto: CallNextDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.callNext(clinicId, userId, dto.doctorId);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start a consultation',
    description: 'Moves a called entry to in-consultation. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  start(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.start(clinicId, userId, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete a consultation',
    description:
      'Finishes the consultation and the appointment. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  complete(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.complete(clinicId, userId, id);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a patient as no-show',
    description:
      'Removes the entry from the queue as a no-show. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  noShow(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.noShow(clinicId, userId, id);
  }

  @Post(':id/notify-delay')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Notify a patient of a delay',
    description:
      'Sends a delay notice with the estimated minutes. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  notifyDelay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotifyDelayDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.notifyDelay(clinicId, userId, id, dto.minutes);
  }

  @Post(':id/priority')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change the priority of an entry',
    description: 'Raises or lowers the queue priority. Requires the manageQueue capability.',
  })
  @ApiOkResponse({ description: 'QueueEntryDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  priority(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PriorityDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.setPriority(clinicId, userId, id, dto.priority);
  }
}
