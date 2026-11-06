import {
  Body,
  Controller,
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
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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

const SCHEDULE_EDITORS = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'];

@ApiTags('doctors')
@ApiBearerAuth()
@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @Roles(...CAPABILITY_ROLES.viewDoctors)
  list(@Query() query: ListDoctorsQueryDto) {
    return this.doctors.list(query);
  }

  @Post()
  @Roles(...CAPABILITY_ROLES.manageDoctors)
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto);
  }

  @Get(':id')
  @Roles(...CAPABILITY_ROLES.viewDoctors)
  get(@Param('id') id: string, @Query() query: DoctorDateQueryDto) {
    return this.doctors.get(id, query.date);
  }

  @Patch(':id')
  @Roles(...CAPABILITY_ROLES.manageDoctors)
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles(...CAPABILITY_ROLES.manageDoctors)
  deactivate(@Param('id') id: string) {
    return this.doctors.deactivate(id);
  }

  @Post(':id/activate')
  @Roles(...CAPABILITY_ROLES.manageDoctors)
  activate(@Param('id') id: string) {
    return this.doctors.activate(id);
  }

  @Put(':id/working-hours')
  @Roles(...SCHEDULE_EDITORS)
  putWorkingHours(@Param('id') id: string, @Body() dto: PutWorkingHoursDto) {
    return this.doctors.putWorkingHours(id, dto);
  }

  @Post(':id/leaves')
  @Roles(...SCHEDULE_EDITORS)
  addLeave(@Param('id') id: string, @Body() dto: CreateLeaveDto) {
    return this.doctors.addLeave(id, dto);
  }

  @Delete(':id/leaves/:leaveId')
  @Roles(...SCHEDULE_EDITORS)
  removeLeave(@Param('id') id: string, @Param('leaveId') leaveId: string) {
    return this.doctors.removeLeave(id, leaveId);
  }

  @Get(':id/slots')
  @Roles(...CAPABILITY_ROLES.viewDoctors)
  slots(@Param('id') id: string, @Query() query: SlotsQueryDto) {
    return this.doctors.slots(id, query);
  }
}
