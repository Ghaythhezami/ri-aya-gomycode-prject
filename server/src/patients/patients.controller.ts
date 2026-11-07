import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  @ApiOperation({
    summary: 'List patients',
    description: 'Searchable, paginated patient list. Requires the viewPatients capability.',
  })
  @ApiOkResponse({ description: 'Page of PatientListItem' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  list(@Query() query: ListPatientsQueryDto) {
    return this.patients.list(query);
  }

  @Get('duplicates')
  @RequireCapability('viewPatients')
  @ApiOperation({
    summary: 'Find possible duplicate patients',
    description:
      'Matches by name, phone or date of birth to avoid double records. Requires the viewPatients capability.',
  })
  @ApiOkResponse({ description: 'PatientListItem[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  duplicates(@Query() query: DuplicatesQueryDto) {
    return this.patients.findDuplicates(query);
  }

  @Post()
  @RequireCapability('viewPatients')
  @ApiOperation({
    summary: 'Create a patient',
    description: 'Registers a patient in the clinic. Requires the viewPatients capability.',
  })
  @ApiCreatedResponse({ description: 'PatientDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Get(':id')
  @RequireCapability('viewPatients')
  @ApiOperation({
    summary: 'Get a patient',
    description: 'Patient profile. Requires the viewPatients capability.',
  })
  @ApiOkResponse({ description: 'PatientDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  get(@Param('id') id: string) {
    return this.patients.get(id);
  }

  @Patch(':id')
  @RequireCapability('viewPatients')
  @ApiOperation({
    summary: 'Update a patient',
    description: 'Edits the patient profile. Requires the viewPatients capability.',
  })
  @ApiOkResponse({ description: 'PatientDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Post(':id/archive')
  @RequireCapability('manageAppointments')
  @ApiOperation({
    summary: 'Archive a patient',
    description:
      'Hides the patient from lists without deleting history. Requires the manageAppointments capability.',
  })
  @ApiCreatedResponse({ description: 'PatientDetail' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  archive(@Param('id') id: string) {
    return this.patients.archive(id);
  }

  @Get(':id/appointments')
  @RequireCapability('viewPatients')
  @ApiOperation({
    summary: 'List appointments of a patient',
    description: 'Appointment history of the patient. Requires the viewPatients capability.',
  })
  @ApiOkResponse({ description: 'AppointmentListItem[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  appointments(@Param('id') id: string) {
    return this.patients.appointments(id);
  }
}
