import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { User } from './users/user.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { PasswordResetToken } from './auth/entities/password-reset-token.entity';

@Module({
  imports: [
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (process.env.NODE_ENV === 'test') {
          return {
            type: 'better-sqlite3' as const,
            database: ':memory:',
            dropSchema: true,
            entities: [User, RefreshToken, PasswordResetToken],
            synchronize: true,
          };
        }

        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get('DB_PORT', 5432)),
          username: config.get<string>('DB_USER', 'riaya'),
          password: config.get<string>('DB_PASSWORD', 'riaya'),
          database: config.get<string>('DB_NAME', 'riaya'),
          entities: [User, RefreshToken, PasswordResetToken],
          synchronize: config.get('DB_SYNC') === 'true',
          migrations: ['dist/database/migrations/*.js'],
          migrationsRun: config.get('DB_MIGRATIONS_RUN') === 'true',
        };
      },
    }),
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
