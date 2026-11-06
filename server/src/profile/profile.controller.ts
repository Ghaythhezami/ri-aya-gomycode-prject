import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { parseAcceptLanguage } from '../rbac/locale.util';
import { CompleteOnboardingDto, UpdateProfileDto } from './dto/profile.dto';
import { OnboardingStateService } from './onboarding-state.service';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user profile with role and capabilities' })
  @ApiResponse({ status: 200, description: 'ProfileDto' })
  get(@Req() req: Request) {
    return this.profile.get(parseAcceptLanguage(req.headers['accept-language']));
  }

  @Patch()
  @ApiOperation({
    summary: 'Update names (per language), phone, job title and preferred language',
    description: 'Password changes stay on POST /api/auth/change-password.',
  })
  @ApiResponse({ status: 200, description: 'The updated ProfileDto' })
  @ApiResponse({ status: 422, description: 'Empty name map or invalid phone number' })
  update(@Body() dto: UpdateProfileDto, @Req() req: Request) {
    return this.profile.update(dto, parseAcceptLanguage(req.headers['accept-language']));
  }
}

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingStateService) {}

  @Get()
  @ApiOperation({ summary: 'Setup checklist (clinic steps only for administrators)' })
  @ApiResponse({ status: 200, description: 'OnboardingState' })
  state() {
    return this.onboarding.state();
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Finish or skip onboarding for the user or (administrators) the clinic',
  })
  @ApiResponse({ status: 201, description: 'The refreshed OnboardingState' })
  @ApiResponse({ status: 403, description: 'Clinic scope needs manageSettings' })
  complete(@Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(dto.scope);
  }
}
