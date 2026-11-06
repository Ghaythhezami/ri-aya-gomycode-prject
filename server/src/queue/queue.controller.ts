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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { QueueService } from './queue.service';
import { CallNextDto, CheckInDto, NotifyDelayDto, PriorityDto } from './queue.dto';

@ApiTags('queue')
@ApiBearerAuth()
@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CAPABILITY_ROLES.manageQueue)
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  snapshot() {
    return this.queue.snapshot(this.tenant.get().clinicId);
  }

  @Post('check-in')
  @HttpCode(200)
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
  callNext(@Body() dto: CallNextDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.callNext(clinicId, userId, dto.doctorId);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.start(clinicId, userId, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.complete(clinicId, userId, id);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.noShow(clinicId, userId, id);
  }

  @Post(':id/notify-delay')
  @HttpCode(200)
  notifyDelay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotifyDelayDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.notifyDelay(clinicId, userId, id, dto.minutes);
  }

  @Post(':id/priority')
  @HttpCode(200)
  priority(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PriorityDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.queue.setPriority(clinicId, userId, id, dto.priority);
  }
}
