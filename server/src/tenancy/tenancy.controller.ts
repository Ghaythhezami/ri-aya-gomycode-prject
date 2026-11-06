import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantContext } from './tenant-context';
import { OnboardingService } from './onboarding.service';
import { MembersService } from './members.service';
import { TenancyService } from './tenancy.service';
import { RegisterDto } from './dto/register.dto';
import { AcceptInvitationDto, CreateOrganizationDto, InviteDto } from './dto/invitation.dto';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { MailService } from '../mail/mail.service';
import type { UserRecord } from '../users/user.types';
import { UserRole } from '../users/user-role.enum';

@ApiTags('tenancy')
@Controller()
export class TenancyController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly tenancy: TenancyService,
    private readonly members: MembersService,
    private readonly tenant: TenantContext,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  @Post('auth/register')
  @RateLimit(5)
  @ApiOperation({
    summary: 'Public registration: create an account, an organization and its first clinic',
    description:
      'This route can only create a NEW organization. It can never join an existing clinic (FR-033).',
  })
  register(@Body() dto: RegisterDto) {
    return this.onboarding.register(dto);
  }

  @Post('auth/accept-invite')
  @RateLimit(10)
  @ApiOperation({ summary: 'Accept a staff invitation and set a password' })
  acceptInvite(@Body() dto: AcceptInvitationDto) {
    return this.onboarding.acceptInvitation(dto);
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

  @Post('invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireCapability('inviteStaff')
  @RateLimit(20)
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
      roleKey: dto.roleKey,
      invitedById: user.id,
    });

    const backoffice = process.env.BACKOFFICE_URL ?? 'http://localhost:5174';
    const acceptUrl = `${backoffice}/accept-invite?token=${result.token}`;
    await this.mail.sendInvitation({
      email: dto.email,
      acceptUrl,
      clinicName: result.clinicName,
      role: result.role,
      locale: user.preferredLocale,
    });

    // The raw token is never returned over HTTP; it is delivered by email only.
    return { invitationId: result.invitation.id, expiresAt: result.invitation.expiresAt };
  }

  @Get('invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireCapability('inviteStaff')
  @ApiOperation({
    summary: 'List pending invitations for the active clinic',
    description: 'Items: { id, email, role, roleId, roleKey, roleName, expiresAt, createdAt }.',
  })
  @ApiResponse({ status: 200, description: 'Pending invitations with their localized role name' })
  @ApiResponse({ status: 403, description: 'Needs inviteStaff' })
  listInvitations() {
    const scope = this.tenant.get();
    return this.onboarding.listPendingInvitations(scope);
  }

  @Get('memberships')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List the staff of the active clinic (manageStaff or inviteStaff)',
    description:
      'Items: { membershipId, userId, name, email, roleKey, roleName, role, status, isSelf }, sorted by name.',
  })
  @ApiResponse({ status: 200, description: 'Members of the caller clinic' })
  @ApiResponse({ status: 403, description: 'Needs manageStaff or inviteStaff' })
  listMembers() {
    return this.members.list();
  }

  @Patch('memberships/:id/suspend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireCapability('suspendMembership')
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
