import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
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
  @RequireCapability('viewPatients')
  list(@Query() query: ListPatientsQueryDto) {
    return this.patients.list(query);
  }

  @Get('duplicates')
  @RequireCapability('viewPatients')
  duplicates(@Query() query: DuplicatesQueryDto) {
    return this.patients.findDuplicates(query);
  }

  @Post()
  @RequireCapability('viewPatients')
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get(':id')
  @RequireCapability('viewPatients')
  get(@Param('id') id: string) {
    return this.patients.get(id);
  }

  @Patch(':id')
  @RequireCapability('viewPatients')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Post(':id/archive')
  @RequireCapability('manageAppointments')
  archive(@Param('id') id: string) {
    return this.patients.archive(id);
  }

  @Get(':id/appointments')
  @RequireCapability('viewPatients')
  appointments(@Param('id') id: string) {
    return this.patients.appointments(id);
  }
}
