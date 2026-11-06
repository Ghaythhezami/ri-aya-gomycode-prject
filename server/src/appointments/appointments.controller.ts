import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AppointmentsService } from './appointments.service';
import {
  BulkActionDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  CreateLockDto,
  ListAppointmentsQueryDto,
  StatusChangeDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Roles(...CAPABILITY_ROLES.viewAppointments)
  list(@Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(query);
  }

  // Static routes are declared before ':id' so they are not captured by it.
  @Get('calendar')
  @Roles(...CAPABILITY_ROLES.viewCalendar)
  calendar(@Query() query: ListAppointmentsQueryDto) {
    return this.appointments.calendar(query);
  }

  @Post('bulk')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  bulk(@Body() dto: BulkActionDto) {
    return this.appointments.bulk(dto);
  }

  @Post('locks')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  lock(@Body() dto: CreateLockDto) {
    return this.appointments.lock(dto);
  }

  @Delete('locks/:token')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  unlock(@Param('token') token: string) {
    return this.appointments.unlock(token);
  }

  @Post('reminders/:deliveryId/retry')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  retryReminder(@Param('deliveryId') deliveryId: string) {
    return this.appointments.retryReminder(deliveryId);
  }

  @Post()
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Get(':id')
  @Roles(...CAPABILITY_ROLES.viewAppointments)
  get(@Param('id') id: string) {
    return this.appointments.get(id);
  }

  @Patch(':id')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  @Post(':id/status')
  @Roles(...CAPABILITY_ROLES.viewAppointments)
  status(@Param('id') id: string, @Body() dto: StatusChangeDto) {
    return this.appointments.changeStatus(id, dto.status);
  }

  @Post(':id/cancel')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointments.cancel(id, dto.reason);
  }

  @Get(':id/alternatives')
  @Roles(...CAPABILITY_ROLES.viewAppointments)
  alternatives(@Param('id') id: string) {
    return this.appointments.alternativesFor(id);
  }
}
