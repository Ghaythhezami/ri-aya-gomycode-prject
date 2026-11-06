import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  DuplicatesQueryDto,
  ListPatientsQueryDto,
  UpdatePatientDto,
} from './dto/patient.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @Roles(...CAPABILITY_ROLES.viewPatients)
  list(@Query() query: ListPatientsQueryDto) {
    return this.patients.list(query);
  }

  @Get('duplicates')
  @Roles(...CAPABILITY_ROLES.viewPatients)
  duplicates(@Query() query: DuplicatesQueryDto) {
    return this.patients.findDuplicates(query);
  }

  @Post()
  @Roles(...CAPABILITY_ROLES.viewPatients)
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get(':id')
  @Roles(...CAPABILITY_ROLES.viewPatients)
  get(@Param('id') id: string) {
    return this.patients.get(id);
  }

  @Patch(':id')
  @Roles(...CAPABILITY_ROLES.viewPatients)
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Post(':id/archive')
  @Roles(...CAPABILITY_ROLES.manageAppointments)
  archive(@Param('id') id: string) {
    return this.patients.archive(id);
  }

  @Get(':id/appointments')
  @Roles(...CAPABILITY_ROLES.viewPatients)
  appointments(@Param('id') id: string) {
    return this.patients.appointments(id);
  }
}
