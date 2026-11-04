import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, Env } from '../config/env';
import { TokenService } from './token.service';

/**
 * Verification only: the service never signs a token (NFR-010). The secret is
 * the same one `server` signs with, and it is read from the environment - there
 * is no committed fallback (NFR-017).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.jwtAccessSecret,
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [TokenService],
  exports: [TokenService],
})
export class AuthModule {}
