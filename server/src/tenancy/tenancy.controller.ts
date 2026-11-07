import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantContext } from './tenant-context';
import { OnboardingService } from './onboarding.service';
import { TenancyService } from './tenancy.service';
import { RegisterDto } from './dto/register.dto';
import { CreateClinicDto } from './dto/clinic.dto';
import { UpdateClinicSettingsDto } from './dto/clinic-settings.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import {
  AcceptInvitationDto,
  ChangeRoleDto,
  CreateOrganizationDto,
  DeclineInvitationDto,
  InviteDto,
} from './dto/invitation.dto';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { MailService } from '../mail/mail.service';
import type { UserRecord } from '../users/user.types';
import { UserRole } from '../users/user-role.enum';

const throttleLimit = (limit: number) => (process.env.NODE_ENV === 'test' ? 1000 : limit);

@ApiTags('tenancy')
@Controller()
export class TenancyController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly tenancy: TenancyService,
    private readonly tenant: TenantContext,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  @Post('auth/register')
  @Throttle({ default: { limit: throttleLimit(5), ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public registration: create an account, an organization and its first clinic',
    description:
      'This route can only create a NEW organization. It can never join an existing clinic (FR-033).',
  })
  register(@Body() dto: RegisterDto) {
    return this.onboarding.register(dto);
  }

  @Post('auth/accept-invite')
  @Throttle({ default: { limit: throttleLimit(10), ttl: 60_000 } })
  @ApiOperation({ summary: 'Accept a staff invitation and set a password' })
  acceptInvite(@Body() dto: AcceptInvitationDto) {
    return this.onboarding.acceptInvitation(dto);
  }

  @Post('invitations/:token/accept')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept an invitation as an existing, signed-in account' })
  acceptInviteAsUser(@CurrentUser() user: UserRecord, @Param('token') token: string) {
    return this.onboarding.acceptInvitationForUser({ token, userId: user.id });
  }

  @Post('organizations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create an additional organization and first clinic for the signed-in user',
  })
  createOrganization(@CurrentUser() user: UserRecord, @Body() dto: CreateOrganizationDto) {
    return this.onboarding.createOrganizationForUser(user.id, dto);
  }

  @Post('clinics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: "Create another clinic inside the caller's organization" })
  createClinic(@CurrentUser() user: UserRecord, @Body() dto: CreateClinicDto) {
    return this.tenancy.createClinic(this.tenant.get(), dto, user.id);
  }

  @Get('clinics/settings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: "Read the active clinic's settings" })
  clinicSettings() {
    return this.tenancy.getClinicSettings(this.tenant.get());
  }

  @Patch('clinics/settings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: "Update the active clinic's settings" })
  updateClinicSettings(@CurrentUser() user: UserRecord, @Body() dto: UpdateClinicSettingsDto) {
    return this.tenancy.updateClinicSettings(this.tenant.get(), dto, user.id);
  }

  @Get('roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: 'List built-in and custom roles for the active clinic' })
  listRoles() {
    return this.tenancy.listRoles(this.tenant.get());
  }

  @Post('roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: 'Create a custom role in the active clinic' })
  createRole(@CurrentUser() user: UserRecord, @Body() dto: CreateRoleDto) {
    return this.tenancy.createRole(this.tenant.get(), dto, user.id);
  }

  @Patch('roles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: 'Edit a custom role in the active clinic' })
  updateRole(@CurrentUser() user: UserRecord, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.tenancy.updateRole(this.tenant.get(), id, dto, user.id);
  }

  @Delete('roles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageSettings)
  @ApiOperation({ summary: 'Delete a custom role in the active clinic' })
  async deleteRole(@CurrentUser() user: UserRecord, @Param('id') id: string) {
    await this.tenancy.deleteRole(this.tenant.get(), id, user.id);
    return { success: true };
  }

  @Get('organizations/overview')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organization-wide counts for the overview page' })
  organizationOverview() {
    return this.tenancy.organizationOverview(this.tenant.get());
  }

  @Post('invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.inviteStaff)
  @Throttle({ default: { limit: throttleLimit(20), ttl: 60_000 } })
  @ApiOperation({ summary: 'Invite a person to the active clinic with a role' })
  async invite(@CurrentUser() user: UserRecord, @Body() dto: InviteDto) {
    const scope = this.tenant.get();

    const result = await this.onboarding.invite({
      email: dto.email,
      clinicId: dto.clinicId,
      // The clinic must be resolved inside the caller's own organization: the
      // body is attacker-controlled and a foreign clinic id must not be honoured.
      scope,
      role: dto.role,
      invitedById: user.id,
    });

    // The link carries the target scope as a convenience for the accept page. The
    // persisted row stays the source of truth: the server ignores these claims on
    // acceptance (FR-046, FR-047).
    const backoffice = process.env.BACKOFFICE_URL ?? 'http://localhost:5174';
    const acceptUrl =
      `${backoffice}/accept-invite?token=${result.token}` +
      `&organizationId=${result.invitation.organizationId}` +
      `&clinicId=${result.invitation.clinicId}` +
      `&role=${result.invitation.role}`;

    // The send runs OUTSIDE the invitation transaction (NFR-016) and its outcome
    // is recorded, not thrown: a provider fault leaves the row PENDING for a
    // resend (AC-049, EC-019). A mock that returns nothing reports SENT.
    const outcome = await this.mail.sendInvitation({
      email: dto.email,
      acceptUrl,
      clinicName: result.clinicName,
      role: dto.role,
      locale: user.preferredLocale,
    });
    await this.onboarding.recordDelivery(result.invitation.id, outcome ?? { status: 'SENT' });

    // The raw token is never returned over HTTP; it is delivered by email only.
    return {
      invitationId: result.invitation.id,
      expiresAt: result.invitation.expiresAt,
      organizationId: result.invitation.organizationId,
      clinicId: result.invitation.clinicId,
      role: result.invitation.role,
      deliveryStatus: outcome?.status ?? 'SENT',
    };
  }

  @Get('invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List invitations for the active clinic, every status, paginated' })
  async listInvitations(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const scope = this.tenant.get();
    const result = await this.onboarding.listInvitations(
      scope,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
    // The body stays a bare array for the existing consumers; the page bounds and
    // the total travel in headers, so a read is still paginated (NFR-019) without
    // changing the v1 array shape (CON-605).
    res?.setHeader('X-Total-Count', String(result.total));
    res?.setHeader('X-Page', String(result.page));
    res?.setHeader('X-Page-Size', String(result.pageSize));
    return result.items;
  }

  @Get('invitations/:token')
  @ApiOperation({ summary: 'Resolve the scope of an invitation link without consuming it' })
  getInvitation(@Param('token') token: string) {
    return this.onboarding.getInvitationByToken(token);
  }

  @Patch('invitations/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.inviteStaff)
  @ApiOperation({ summary: 'Cancel a pending invitation; its token can no longer be used' })
  async cancelInvitation(@CurrentUser() user: UserRecord, @Param('id') id: string) {
    const scope = this.tenant.get();
    await this.onboarding.cancelInvitation(id, user.id, scope);
    return { success: true };
  }

  @Post('invitations/:id/resend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.inviteStaff)
  @Throttle({ default: { limit: throttleLimit(20), ttl: 60_000 } })
  @ApiOperation({ summary: 'Re-issue the token and re-send a pending invitation' })
  async resendInvitation(@CurrentUser() user: UserRecord, @Param('id') id: string) {
    const scope = this.tenant.get();
    const result = await this.onboarding.resendInvitation(id, scope);

    const backoffice = process.env.BACKOFFICE_URL ?? 'http://localhost:5174';
    const acceptUrl =
      `${backoffice}/accept-invite?token=${result.token}` +
      `&organizationId=${result.invitation.organizationId}` +
      `&clinicId=${result.invitation.clinicId}` +
      `&role=${result.invitation.role}`;

    const outcome = await this.mail.sendInvitation({
      email: result.invitation.email,
      acceptUrl,
      clinicName: result.clinicName,
      role: result.invitation.role,
      locale: user.preferredLocale,
    });
    await this.onboarding.recordDelivery(result.invitation.id, outcome ?? { status: 'SENT' });

    return { invitationId: result.invitation.id, deliveryStatus: outcome?.status ?? 'SENT' };
  }

  @Post('invitations/:token/decline')
  @Throttle({ default: { limit: throttleLimit(10), ttl: 60_000 } })
  @ApiOperation({ summary: 'Decline an invitation; its token is invalidated' })
  async declineInvitation(@Param('token') token: string, @Body() dto: DeclineInvitationDto) {
    // The path token is authoritative; the body token is accepted for clients that
    // post it, but a mismatch is ignored in favour of the path segment.
    await this.onboarding.declineInvitation(token || dto.token);
    return { success: true };
  }

  @Get('memberships')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List the members of the active clinic with their last login' })
  async listMembers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.tenancy.listClinicMembers(
      this.tenant.get(),
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
    // Bounds travel in headers so a read is paginated (NFR-019) while the body
    // stays a bare array, matching the invitations list (CON-605).
    res?.setHeader('X-Total-Count', String(result.total));
    res?.setHeader('X-Page', String(result.page));
    res?.setHeader('X-Page-Size', String(result.pageSize));
    return result.items;
  }

  @Patch('memberships/:id/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.manageStaff)
  @ApiOperation({ summary: "Change a member's role within the caller's scope" })
  async changeRole(
    @CurrentUser() user: UserRecord,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const scope = this.tenant.get();
    const organizationWide = scope.role === UserRole.SUPER_ADMIN;
    await this.tenancy.changeMembershipRole({
      membershipId: id,
      role: dto.role,
      actorUserId: user.id,
      organizationWide,
    });
    return { success: true };
  }

  @Patch('memberships/:id/suspend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CAPABILITY_ROLES.suspendMembership)
  @ApiOperation({ summary: 'Suspend a membership, revoking that clinic access immediately' })
  async suspend(@Param('id') id: string) {
    const scope = this.tenant.get();
    // The id comes from the path, so it is attacker-controlled: it MUST be
    // resolved inside the caller's own organization. A super admin is
    // organization-wide, every other role may only act within their clinic.
    const organizationWide = scope.role === UserRole.SUPER_ADMIN;
    await this.tenancy.suspendMembership({ membershipId: id, organizationWide });
    return { success: true };
  }
}
