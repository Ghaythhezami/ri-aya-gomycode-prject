import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RateLimit } from '../common/throttle/rate-limit';
import { PortalAuthService } from './auth/portal-auth.service';
import { PORTAL_REFRESH_COOKIE } from './portal.constants';
import { PortalAcceptInviteDto, PortalLoginDto, PortalRegisterDto } from './dto/portal-auth.dto';

@ApiTags('portal')
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private readonly auth: PortalAuthService) {}

  @Post('register')
  @RateLimit(5)
  @ApiOperation({
    summary: 'Create a patient account and a new patient record (self-registration)',
    description:
      'Returns PortalAuthResponse and sets the portal_refresh cookie. A phone + birth date match flags the new record for staff review, it is never linked.',
  })
  @ApiCreatedResponse({ description: 'PortalAuthResponse' })
  @ApiConflictResponse({ description: 'ACCOUNT_EXISTS' })
  @ApiForbiddenResponse({ description: 'Self-registration disabled' })
  register(@Body() dto: PortalRegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res);
  }

  @Post('accept-invite')
  @RateLimit(10)
  @ApiOperation({ summary: 'Attach a new account to an existing patient with a desk invite' })
  @ApiCreatedResponse({ description: 'PortalAuthResponse' })
  acceptInvite(@Body() dto: PortalAcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.acceptInvite(dto, res);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({
    summary: 'Sign in (lockout 15 minutes after 5 failures from one IP, or 20 for the e-mail)',
  })
  @ApiOkResponse({ description: 'PortalAuthResponse' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS or ACCOUNT_LOCKED' })
  login(
    @Body() dto: PortalLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, res, req.ip);
  }

  @Post('refresh')
  @HttpCode(200)
  @RateLimit(30)
  @ApiOperation({ summary: 'Rotate the portal_refresh cookie and issue a new access token' })
  @ApiOkResponse({ description: 'PortalAuthResponse' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[PORTAL_REFRESH_COOKIE], res);
  }

  @Post('logout')
  @HttpCode(200)
  @RateLimit(30)
  @ApiOperation({ summary: 'Revoke the refresh-token family and clear the cookie' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.cookies?.[PORTAL_REFRESH_COOKIE], res);
  }
}
