import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { TenantContext } from './tenant-context';
import { OnboardingService } from './onboarding.service';
import { TenancyController } from './tenancy.controller';

@Global()
@Module({
  controllers: [TenancyController],
  providers: [TenancyService, TenantContext, OnboardingService],
  exports: [TenancyService, TenantContext, OnboardingService],
})
export class TenancyModule {}
