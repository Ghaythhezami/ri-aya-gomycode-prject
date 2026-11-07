import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit';
import { PortalJwtGuard } from './auth/portal-jwt.guard';
import {
  PortalAppointmentsQueryDto,
  PortalBookDto,
  PortalCancelDto,
  PortalProfileDto,
  PortalRescheduleDto,
  PortalSlotsQueryDto,
} from './dto/portal.dto';
import { PortalService } from './portal.service';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('clinics')
  @RateLimit(30)
  @ApiOperation({ summary: 'Clinics with the patient portal enabled (public)' })
  @ApiOkResponse({ description: 'PortalClinic[]' })
  clinics() {
    return this.portal.clinics();
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'The signed-in patient' })
  @ApiOkResponse({ description: 'PortalMe' })
  me() {
    return this.portal.me();
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Update profile, language, contact preference and AI consent' })
  @ApiOkResponse({ description: 'PortalMe' })
  updateMe(@Body() dto: PortalProfileDto) {
    return this.portal.updateMe(dto);
  }

  @Get('doctors')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Active doctors of the clinic' })
  @ApiOkResponse({ description: 'PortalDoctor[]' })
  doctors() {
    return this.portal.listDoctors();
  }

  @Get('appointment-types')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Active, non-emergency appointment types' })
  appointmentTypes() {
    return this.portal.appointmentTypes();
  }

  @Get('slots')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Free future slots of a doctor on a day' })
  @ApiOkResponse({ description: 'PortalSlot[]' })
  slots(@Query() query: PortalSlotsQueryDto) {
    return this.portal.slots(query);
  }

  @Get('appointments')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Own appointments (upcoming or past)' })
  @ApiOkResponse({ description: 'PortalAppointment[]' })
  appointments(@Query() query: PortalAppointmentsQueryDto) {
    return this.portal.listAppointments(query);
  }

  @Post('appointments')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @RateLimit(20)
  @ApiOperation({
    summary: 'Book an appointment (non-emergency, source PORTAL, at most 3 upcoming)',
  })
  @ApiConflictResponse({ description: 'SLOT_CONFLICT with alternatives, or the booking limit' })
  book(@Body() dto: PortalBookDto) {
    return this.portal.book(dto);
  }

  @Post('appointments/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @RateLimit(20)
  @ApiOperation({ summary: 'Cancel an own appointment within the cancellation notice' })
  @ApiConflictResponse({ description: 'CANCELLATION_POLICY' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalCancelDto) {
    return this.portal.cancel(id, dto);
  }

  @Post('appointments/:id/reschedule')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @RateLimit(20)
  @ApiOperation({ summary: 'Reschedule an own appointment within the cancellation notice' })
  @ApiConflictResponse({ description: 'SLOT_CONFLICT with alternatives, or CANCELLATION_POLICY' })
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalRescheduleDto) {
    return this.portal.reschedule(id, dto);
  }

  @Get('summary')
  @ApiBearerAuth()
  @UseGuards(PortalJwtGuard)
  @ApiOperation({ summary: 'Latest clinician-published summary, or null' })
  summary() {
    return this.portal.summary();
  }
}
