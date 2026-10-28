import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantContext } from './tenant-context';
import { OnboardingService } from './onboarding.service';
import { TenancyService } from './tenancy.service';
import { RegisterDto } from './dto/register.dto';
import { AcceptInvitationDto, CreateOrganizationDto, InviteDto } from './dto/invitation.dto';
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
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: throttleLimit(20), ttl: 60_000 } })
  @ApiOperation({ summary: 'Invite a person to the active clinic with a role' })
  async invite(@CurrentUser() user: UserRecord, @Body() dto: InviteDto, @Req() req: Request) {
    const scope = this.tenant.get();
    this.onboarding.assertCanInvite(scope.role);

    const result = await this.onboarding.invite({
      email: dto.email,
      clinicId: dto.clinicId,
      role: dto.role,
      invitedById: user.id,
    });

    const backoffice = process.env.BACKOFFICE_URL ?? 'http://localhost:5173';
    const acceptUrl = `${backoffice}/accept-invite?token=${result.token}`;
    await this.mail.sendInvitation({
      email: dto.email,
      acceptUrl,
      clinicName: result.clinicName,
      role: dto.role,
      locale: user.preferredLocale,
    });

    // The raw token is never returned over HTTP; it is delivered by email only.
    return { invitationId: result.invitation.id, expiresAt: result.invitation.expiresAt };
  }

  @Get('invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List pending invitations for the active clinic' })
  listInvitations() {
    const scope = this.tenant.get();
    return this.onboarding.listPendingInvitations(scope.clinicId);
  }

  @Patch('memberships/:id/suspend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Suspend a membership, revoking that clinic access immediately' })
  async suspend(@Param('id') id: string) {
    const scope = this.tenant.get();
    if (scope.role !== UserRole.SUPER_ADMIN && scope.role !== UserRole.CLINIC_ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only clinic admins can suspend memberships',
      });
    }
    await this.tenancy.suspendMembership(id);
    return { success: true };
  }
}
