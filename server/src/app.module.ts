import { Module } from '@nestjs/common';
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
import { OperationsModule } from './operations.module';

@Module({
  imports: [
    // FR-001: the logger must exist before any other module initialises, so a
    // module that logs during construction already has a sink to write to.
    LoggingModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: process.env.NODE_ENV === 'test' ? 1000 : 60,
        },
      ],
    }),
    PrismaModule,
    RedisCacheModule,
    TenancyModule,
    AuditModule,
    AuthModule,
    UsersModule,
    HealthModule,
    EventsModule,
    CoreModule,
    ClinicalModule,
    OperationsModule,
    DemoModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
