import { Module } from '@nestjs/common';
import { OnboardingStateService } from './onboarding-state.service';
import { OnboardingController, ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController, OnboardingController],
  providers: [ProfileService, OnboardingStateService],
  exports: [ProfileService, OnboardingStateService],
})
export class ProfileModule {}
