import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PatientContext, PatientContextMiddleware } from './auth/patient-context';
import { PortalJwtGuard } from './auth/portal-jwt.guard';

/**
 * Patient identity primitives other modules import (AI, documents): the guard, the request
 * context and the JWT service the guard needs. Global so `@UseGuards(PortalJwtGuard)` resolves
 * in any feature module.
 */
@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [PatientContext, PatientContextMiddleware, PortalJwtGuard],
  exports: [PatientContext, PortalJwtGuard, JwtModule],
})
export class PortalAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PatientContextMiddleware).forRoutes('*');
  }
}
