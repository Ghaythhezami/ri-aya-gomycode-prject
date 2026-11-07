import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimit } from '../common/throttle/rate-limit';
import { StaffInviteService } from './staff-invite.service';

/**
 * Capability decision: `manageAppointments` (front desk and admins). Inviting a patient to the
 * portal is a desk task next to booking; doctors do not need it.
 */
@ApiTags('portal')
@ApiBearerAuth()
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffInviteController {
  constructor(private readonly invites: StaffInviteService) {}

  @Post(':id/portal-invite')
  @RequireCapability('manageAppointments')
  @RateLimit(20)
  @ApiOperation({
    summary: 'Create a 7-day one-time portal invite link for an existing patient',
    description:
      'Returns { url, expiresAt } (PortalInvite). 409 ACCOUNT_EXISTS when already linked.',
  })
  @ApiConflictResponse({ description: 'The patient already has a portal account' })
  invite(@Param('id', ParseUUIDPipe) id: string) {
    return this.invites.invite(id);
  }

  @Get(':id/portal-status')
  @RequireCapability('manageAppointments')
  @ApiOperation({ summary: 'Portal account status of a patient (PatientPortalStatus)' })
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.invites.status(id);
  }

  @Post(':id/portal-verify')
  @HttpCode(200)
  @RequireCapability('manageAppointments')
  @RateLimit(20)
  @ApiOperation({
    summary: 'Confirm the identity of the patient portal account (ID checked at the desk)',
    description:
      'Verified accounts can upload documents, use the assistant, hold 3 upcoming appointments and get reminders.',
  })
  @ApiNotFoundResponse({ description: 'The patient has no portal account' })
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.invites.verify(id);
  }
}
