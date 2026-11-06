import { Body, Controller, Get, GoneException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit';
import { Request, Response } from 'express';
import { AuthService, REFRESH_COOKIE } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserRecord } from '../users/user.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @RateLimit(8)
  @ApiOperation({
    summary: 'Retired — register an organization at POST /auth/register',
    description:
      'The path stays registered so it remains resolvable (FR-026), but it no longer creates an identity (FR-036). It always responds 410 SIGNUP_RETIRED (FR-038, AC-045).',
  })
  signup(): never {
    throw new GoneException({
      code: 'SIGNUP_RETIRED',
      message:
        'Self signup is retired. Create your organization with POST /api/auth/register; staff join a clinic through an invitation.',
    });
  }

  @Post('login')
  @RateLimit(10)
  @ApiOperation({ summary: 'Sign in and receive an access token' })
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, res, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Post('refresh')
  @RateLimit(30)
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access token' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[REFRESH_COOKIE], res, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Post('logout')
  @RateLimit(30)
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Return the signed-in user' })
  me(@CurrentUser() user: UserRecord) {
    return this.auth.me(user);
  }

  @Get('memberships')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List the clinics this user can switch to, with their role in each' })
  memberships(@CurrentUser() user: UserRecord) {
    return this.auth.listMemberships(user);
  }

  @Post('switch-workspace')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit(20)
  @ApiOperation({ summary: 'Re-issue an access token scoped to another clinic' })
  switchWorkspace(
    @CurrentUser() user: UserRecord,
    @Body() dto: SwitchWorkspaceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.switchWorkspace(user, dto.clinicId, res, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit(5)
  @ApiOperation({ summary: 'Change the signed-in user password' })
  changePassword(@CurrentUser() user: UserRecord, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  @Post('forgot-password')
  @RateLimit(5)
  @ApiOperation({
    summary:
      'Request a password reset e-mail (always 200, never reveals whether the account exists)',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @RateLimit(10)
  @ApiOperation({ summary: 'Set a new password with a reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
