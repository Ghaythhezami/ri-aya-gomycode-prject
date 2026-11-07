import { RedisThrottlerStorage } from './cache/redis-throttler.storage';
import { RbacModule } from './rbac/rbac.module';
import { RolesModule } from './roles/roles.module';
import { ProfileModule } from './profile/profile.module';
import { ServicesModule } from './services/services.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggingModule } from './logging/logging.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma.module';
import { RedisCacheModule } from './cache/redis-cache.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AuditModule } from './audit/audit.module';
import { EventsModule } from './events/events.module';
import { CoreModule } from './core/core.module';
import { DemoModule } from './demo/demo.module';
import { ClinicalModule } from './clinical.module';
import { AppointmentTypesModule } from './appointment-types/appointment-types.module';
import { OperationsModule } from './operations.module';
import { RequestLocaleMiddleware } from './common/locale/request-locale.middleware';
import { PortalAuthModule } from './portal/portal-auth.module';
import { PortalModule } from './portal/portal.module';
import { RealtimeTicketModule } from './realtime-ticket/realtime-ticket.module';
import { AiModule } from './ai/ai.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    // FR-001: the logger must exist before any other module initialises, so a
    // module that logs during construction already has a sink to write to.
    LoggingModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    // Counters live in Redis when REDIS_URL is set, so every serverless instance shares
    // the same limit; otherwise (and during a Redis outage) they fall back to memory.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: process.env.NODE_ENV === 'test' ? 1000 : 60,
        },
      ],
      storage: new RedisThrottlerStorage(process.env.REDIS_URL),
    }),
    PrismaModule,
    RedisCacheModule,
    ServicesModule,
    RbacModule,
    TenancyModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ProfileModule,
    HealthModule,
    EventsModule,
    CoreModule,
    ClinicalModule,
    AppointmentTypesModule,
    OperationsModule,
    RealtimeTicketModule,
    AiModule,
    DocumentsModule,
    PortalAuthModule,
    PortalModule,
    DemoModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLocaleMiddleware).forRoutes('*');
  }
}
