import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
  @Roles(...CAPABILITY_ROLES.viewOverview)
  getReference() {
    return this.reference.get(this.tenant.get().clinicId);
  }

  @Get('rooms')
  @Roles(...CAPABILITY_ROLES.viewOverview)
  listRooms() {
    return this.rooms.list();
  }

  @Post('rooms')
  @Roles(...CAPABILITY_ROLES.manageDoctors)
  createRoom(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Get('specialties')
  @Roles(...CAPABILITY_ROLES.viewDoctors)
  specialties() {
    return this.rooms.specialties();
  }
}
