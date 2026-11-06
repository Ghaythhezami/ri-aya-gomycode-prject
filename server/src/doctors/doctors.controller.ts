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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  list(@Query() query: ListDoctorsQueryDto) {
    return this.doctors.list(query);
  }

  @Post()
  @RequireCapability('manageDoctors')
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto);
  }

  @Get(':id')
  @RequireCapability('viewDoctors')
  get(@Param('id') id: string, @Query() query: DoctorDateQueryDto) {
    return this.doctors.get(id, query.date, query.from, query.to);
  }

  @Patch(':id')
  @RequireCapability('manageDoctors')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequireCapability('manageDoctors')
  deactivate(@Param('id') id: string) {
    return this.doctors.deactivate(id);
  }

  @Post(':id/activate')
  @RequireCapability('manageDoctors')
  activate(@Param('id') id: string) {
    return this.doctors.activate(id);
  }

  @Put(':id/working-hours')
  async putWorkingHours(@Param('id') id: string, @Body() dto: PutWorkingHoursDto) {
    await this.assertScheduleEditor(id);
    return this.doctors.putWorkingHours(id, dto);
  }

  @Post(':id/leaves')
  async addLeave(@Param('id') id: string, @Body() dto: CreateLeaveDto) {
    await this.assertScheduleEditor(id);
    return this.doctors.addLeave(id, dto);
  }

  @Delete(':id/leaves/:leaveId')
  async removeLeave(@Param('id') id: string, @Param('leaveId') leaveId: string) {
    await this.assertScheduleEditor(id);
    return this.doctors.removeLeave(id, leaveId);
  }

  @Get(':id/slots')
  @RequireCapability('viewDoctors')
  slots(@Param('id') id: string, @Query() query: SlotsQueryDto) {
    return this.doctors.slots(id, query);
  }
}
