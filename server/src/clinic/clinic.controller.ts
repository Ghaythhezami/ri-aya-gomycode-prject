import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { ClinicReferenceService } from './clinic-reference.service';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('clinic')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicController {
  constructor(
    private readonly reference: ClinicReferenceService,
    private readonly rooms: RoomsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('clinic/reference')
  @RequireCapability('viewOverview')
  @ApiOperation({
    summary: 'Get clinic reference data',
    description:
      'Time zone, locale and lookup lists the workspace needs at start-up. Requires the viewOverview capability.',
  })
  @ApiOkResponse({ description: 'ClinicReference' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  getReference() {
    return this.reference.get(this.tenant.get().clinicId);
  }

  @Get('rooms')
  @RequireCapability('viewOverview')
  @ApiOperation({
    summary: 'List rooms',
    description: 'Rooms of the clinic. Requires the viewOverview capability.',
  })
  @ApiOkResponse({ description: 'RoomDto[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  listRooms() {
    return this.rooms.list();
  }

  @Post('rooms')
  @RequireCapability('manageDoctors')
  @ApiOperation({
    summary: 'Create a room',
    description: 'Adds a room to the clinic. Requires the manageDoctors capability.',
  })
  @ApiCreatedResponse({ description: 'RoomDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  createRoom(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Get('specialties')
  @RequireCapability('viewDoctors')
  @ApiOperation({
    summary: 'List specialties',
    description: 'Medical specialties available for doctors. Requires the viewDoctors capability.',
  })
  @ApiOkResponse({ description: 'Specialty[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  specialties() {
    return this.rooms.specialties();
  }
}
