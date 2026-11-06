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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  bulk(@Body() dto: BulkActionDto) {
    return this.appointments.bulk(dto);
  }

  @Post('locks')
  @RateLimit(30)
  @RequireCapability('manageAppointments')
  lock(@Body() dto: CreateLockDto) {
    return this.appointments.lock(dto);
  }

  @Delete('locks/:token')
  @RequireCapability('manageAppointments')
  unlock(@Param('token') token: string) {
    return this.appointments.unlock(token);
  }

  @Post('reminders/:deliveryId/retry')
  @RequireCapability('manageAppointments')
  retryReminder(@Param('deliveryId') deliveryId: string) {
    return this.appointments.retryReminder(deliveryId);
  }

  @Post()
  @RateLimit(20)
  @RequireCapability('manageAppointments')
  async create(@Body() dto: CreateAppointmentDto, @Headers('accept-language') lang?: string) {
    return this.appointments.withTypeInfo(
      await this.appointments.create(dto),
      parseAcceptLanguage(lang),
    );
  }

  @Get(':id')
  @RequireCapability('viewAppointments')
  async get(@Param('id') id: string, @Headers('accept-language') lang?: string) {
    return this.appointments.withTypeInfo(
      await this.appointments.get(id),
      parseAcceptLanguage(lang),
    );
  }

  @Patch(':id')
  @RequireCapability('manageAppointments')
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
  status(@Param('id') id: string, @Body() dto: StatusChangeDto) {
    return this.appointments.changeStatus(id, dto.status);
  }

  @Post(':id/cancel')
  @RequireCapability('manageAppointments')
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointments.cancel(id, dto.reason);
  }

  @Get(':id/alternatives')
  @RequireCapability('viewAppointments')
  alternatives(@Param('id') id: string) {
    return this.appointments.alternativesFor(id);
  }
}
