import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  getReference() {
    return this.reference.get(this.tenant.get().clinicId);
  }

  @Get('rooms')
  @RequireCapability('viewOverview')
  listRooms() {
    return this.rooms.list();
  }

  @Post('rooms')
  @RequireCapability('manageDoctors')
  createRoom(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Get('specialties')
  @RequireCapability('viewDoctors')
  specialties() {
    return this.rooms.specialties();
  }
}
