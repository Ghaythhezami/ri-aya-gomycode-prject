import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { TenantContext } from './tenant-context';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { OnboardingService } from './onboarding.service';
import { TenancyController } from './tenancy.controller';

@Global()
@Module({
  controllers: [TenancyController],
  providers: [TenancyService, TenantContext, OnboardingService],
  exports: [TenancyService, TenantContext, OnboardingService],
})
export class TenancyModule implements NestModule {
  /**
   * Every request gets the tenant frame, so `TenantContext.get()` works in any
   * controller (D15). Applied to all routes rather than a controller list, so a
   * future clinic-scoped controller cannot silently miss the frame.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
