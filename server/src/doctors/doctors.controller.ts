import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { RbacService } from '../rbac/rbac.service';
import { TenantContext } from '../tenancy/tenant-context';
import { DoctorsService } from './doctors.service';
import {
  CreateDoctorDto,
  CreateLeaveDto,
  DoctorDateQueryDto,
  ListDoctorsQueryDto,
  PutWorkingHoursDto,
  SlotsQueryDto,
  UpdateDoctorDto,
} from './dto/doctor.dto';

@ApiTags('doctors')
@ApiBearerAuth()
@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(
    private readonly doctors: DoctorsService,
    private readonly rbac: RbacService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Schedule edits need `manageDoctors`, or `viewScheduling` on the doctor's OWN profile
   * (the service also pins DOCTOR users to their own schedule). A role name alone grants nothing.
   */
  private async assertScheduleEditor(doctorId: string): Promise<void> {
    const scope = this.tenant.get();
    if (await this.rbac.has(scope, 'manageDoctors')) return;
    if (
      (await this.rbac.has(scope, 'viewScheduling')) &&
      (await this.doctors.ownDoctorId(scope)) === doctorId
    ) {
      return;
    }
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    });
  }

  @Get()
  @RequireCapability('viewDoctors')
  @ApiOperation({
    summary: 'List doctors',
    description:
      'Doctors of the clinic with filters and pagination. Requires the viewDoctors capability.',
  })
  @ApiOkResponse({ description: 'Page of DoctorSummary' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  list(@Query() query: ListDoctorsQueryDto) {
    return this.doctors.list(query);
  }

  @Post()
  @RequireCapability('manageDoctors')
  @ApiOperation({
    summary: 'Create a doctor',
    description: 'Creates the doctor profile and its login. Requires the manageDoctors capability.',
  })
  @ApiCreatedResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto);
  }

  @Get(':id')
  @RequireCapability('viewDoctors')
  @ApiOperation({
    summary: 'Get a doctor',
    description:
      'Profile, schedule and utilisation for an optional date. Requires the viewDoctors capability.',
  })
  @ApiOkResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  get(@Param('id') id: string, @Query() query: DoctorDateQueryDto) {
    return this.doctors.get(id, query.date, query.from, query.to);
  }

  @Patch(':id')
  @RequireCapability('manageDoctors')
  @ApiOperation({
    summary: 'Update a doctor',
    description: 'Edits the doctor profile. Requires the manageDoctors capability.',
  })
  @ApiOkResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequireCapability('manageDoctors')
  @ApiOperation({
    summary: 'Deactivate a doctor',
    description:
      'Stops new bookings with the doctor; history is kept. Requires the manageDoctors capability.',
  })
  @ApiCreatedResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  deactivate(@Param('id') id: string) {
    return this.doctors.deactivate(id);
  }

  @Post(':id/activate')
  @RequireCapability('manageDoctors')
  @ApiOperation({
    summary: 'Activate a doctor',
    description: 'Re-enables a deactivated doctor. Requires the manageDoctors capability.',
  })
  @ApiCreatedResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  activate(@Param('id') id: string) {
    return this.doctors.activate(id);
  }

  @Put(':id/working-hours')
  @ApiOperation({
    summary: 'Replace the weekly working hours',
    description:
      'Replaces the weekly schedule. Requires manageDoctors, or viewScheduling on the doctor own profile.',
  })
  @ApiOkResponse({ description: 'DoctorDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  async putWorkingHours(@Param('id') id: string, @Body() dto: PutWorkingHoursDto) {
    await this.assertScheduleEditor(id);
    return this.doctors.putWorkingHours(id, dto);
  }

  @Post(':id/leaves')
  @ApiOperation({
    summary: 'Add a leave period',
    description:
      'Blocks a date range from booking. Requires manageDoctors, or viewScheduling on the doctor own profile.',
  })
  @ApiCreatedResponse({ description: 'LeaveDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  async addLeave(@Param('id') id: string, @Body() dto: CreateLeaveDto) {
    await this.assertScheduleEditor(id);
    return this.doctors.addLeave(id, dto);
  }

  @Delete(':id/leaves/:leaveId')
  @ApiOperation({
    summary: 'Remove a leave period',
    description:
      'Deletes a leave period. Requires manageDoctors, or viewScheduling on the doctor own profile.',
  })
  @ApiOkResponse({ description: 'Leave removed' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  async removeLeave(@Param('id') id: string, @Param('leaveId') leaveId: string) {
    await this.assertScheduleEditor(id);
    return this.doctors.removeLeave(id, leaveId);
  }

  @Get(':id/slots')
  @RequireCapability('viewDoctors')
  @ApiOperation({
    summary: 'List free slots of a doctor',
    description:
      'Bookable slots for a date, derived from working hours, leaves and existing appointments. Requires the viewDoctors capability.',
  })
  @ApiOkResponse({ description: 'SlotDto[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  slots(@Param('id') id: string, @Query() query: SlotsQueryDto) {
    return this.doctors.slots(id, query);
  }
}
