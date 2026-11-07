import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { RateLimit } from '../common/throttle/rate-limit';
import { parseAcceptLanguage } from '../appointment-types/appointment-type-rules';
import { AppointmentsService } from './appointments.service';
import {
  BulkActionDto,
  CancelAppointmentDto,
  ChangeAppointmentTypeDto,
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
  @RequireCapability('viewAppointments')
  @ApiOperation({
    summary: 'List appointments',
    description:
      'Paginated, filterable list of appointments of the clinic. Requires the viewAppointments capability.',
  })
  @ApiOkResponse({ description: 'Page of AppointmentListItem' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async list(@Query() query: ListAppointmentsQueryDto, @Headers('accept-language') lang?: string) {
    const page = await this.appointments.list(query);
    return {
      ...page,
      items: await this.appointments.withTypeInfo(page.items, parseAcceptLanguage(lang)),
    };
  }

  // Static routes are declared before ':id' so they are not captured by it.
  @Get('calendar')
  @RequireCapability('viewCalendar')
  @ApiOperation({
    summary: 'List appointments for the calendar',
    description:
      'Appointments in a date window, shaped for the calendar views. Requires the viewCalendar capability.',
  })
  @ApiOkResponse({ description: 'AppointmentListItem[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async calendar(
    @Query() query: ListAppointmentsQueryDto,
    @Headers('accept-language') lang?: string,
  ) {
    return this.appointments.withTypeInfo(
      await this.appointments.calendar(query),
      parseAcceptLanguage(lang),
    );
  }

  @Post('bulk')
  @RateLimit(10)
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Apply an action to several appointments',
    description:
      'Applies the same action to a set of appointments and reports the outcome per item. Rate limited. Requires the manageAppointments capability.',
  })
  @ApiOkResponse({ description: 'BulkActionResult' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  bulk(@Body() dto: BulkActionDto) {
    return this.appointments.bulk(dto);
  }

  @Post('locks')
  @RateLimit(30)
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Hold a slot while booking',
    description:
      'Creates a short-lived slot lock so concurrent bookings cannot take the slot. Rate limited. Requires the manageAppointments capability.',
  })
  @ApiCreatedResponse({ description: 'SlotLock' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  lock(@Body() dto: CreateLockDto) {
    return this.appointments.lock(dto);
  }

  @Delete('locks/:token')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Release a slot lock',
    description:
      'Releases a lock created by the lock endpoint. Requires the manageAppointments capability.',
  })
  @ApiOkResponse({ description: 'Lock released' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  unlock(@Param('token') token: string) {
    return this.appointments.unlock(token);
  }

  @Post('reminders/:deliveryId/retry')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Retry a failed reminder delivery',
    description:
      'Queues a failed reminder delivery for another attempt. Requires the manageAppointments capability.',
  })
  @ApiCreatedResponse({ description: 'ReminderDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  retryReminder(@Param('deliveryId') deliveryId: string) {
    return this.appointments.retryReminder(deliveryId);
  }

  @Post()
  @RateLimit(20)
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Book an appointment',
    description:
      'Creates the appointment in a SERIALIZABLE transaction. A taken slot returns 409 SLOT_CONFLICT with alternative slots. Rate limited; x-riaya-source: assistant marks an assistant proposal. Requires the manageAppointments capability.',
  })
  @ApiCreatedResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'SLOT_CONFLICT with alternative slots' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  async create(
    @Body() dto: CreateAppointmentDto,
    @Headers('accept-language') lang?: string,
    @Headers('x-riaya-source') source?: string,
  ) {
    // Staff confirming an assistant proposal (ADR 0005); any other value is ignored.
    const origin = source?.toLowerCase() === 'assistant' ? 'ASSISTANT' : 'STAFF';
    return this.appointments.withTypeInfo(
      await this.appointments.create(dto, { source: origin }),
      parseAcceptLanguage(lang),
    );
  }

  @Get(':id')
  @RequireCapability('viewAppointments')
  @ApiOperation({
    summary: 'Get an appointment',
    description: 'Full detail of one appointment. Requires the viewAppointments capability.',
  })
  @ApiOkResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  async get(@Param('id') id: string, @Headers('accept-language') lang?: string) {
    return this.appointments.withTypeInfo(
      await this.appointments.get(id),
      parseAcceptLanguage(lang),
    );
  }

  @Patch(':id')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Update or reschedule an appointment',
    description:
      'Changes time, doctor, room or notes. A taken slot returns 409 SLOT_CONFLICT with alternative slots. Requires the manageAppointments capability.',
  })
  @ApiOkResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'SLOT_CONFLICT with alternative slots' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @Headers('accept-language') lang?: string,
  ) {
    return this.appointments.withTypeInfo(
      await this.appointments.update(id, dto),
      parseAcceptLanguage(lang),
    );
  }

  @Patch(':id/type')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Change the appointment type',
    description:
      'Switches the type and re-checks duration and availability. A taken slot returns 409 SLOT_CONFLICT with alternative slots. Requires the manageAppointments capability.',
  })
  @ApiOkResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'SLOT_CONFLICT with alternative slots' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  async changeType(
    @Param('id') id: string,
    @Body() dto: ChangeAppointmentTypeDto,
    @Headers('accept-language') lang?: string,
  ) {
    return this.appointments.withTypeInfo(
      await this.appointments.changeType(id, dto),
      parseAcceptLanguage(lang),
    );
  }

  @Post(':id/status')
  @RequireCapability('viewAppointments')
  @ApiOperation({
    summary: 'Change the appointment status',
    description:
      'Moves the appointment through the status state machine; invalid transitions are rejected. Requires the viewAppointments capability.',
  })
  @ApiOkResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  status(@Param('id') id: string, @Body() dto: StatusChangeDto) {
    return this.appointments.changeStatus(id, dto.status);
  }

  @Post(':id/cancel')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Cancel an appointment',
    description:
      'Cancels with an optional reason and frees the slot. Requires the manageAppointments capability.',
  })
  @ApiOkResponse({ description: 'AppointmentDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointments.cancel(id, dto.reason);
  }

  @Get(':id/alternatives')
  @RequireCapability('viewAppointments')
  @ApiOperation({
    summary: 'Suggest alternative slots',
    description:
      'Ranked alternative slots for an appointment, for rescheduling. Requires the viewAppointments capability.',
  })
  @ApiOkResponse({ description: 'AlternativeSlot[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  alternatives(@Param('id') id: string) {
    return this.appointments.alternativesFor(id);
  }
}
