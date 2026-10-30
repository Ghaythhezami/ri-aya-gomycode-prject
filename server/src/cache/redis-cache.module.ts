import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';
import { LoginAttemptService } from './login-attempt.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Global()
@Module({
  providers: [RedisCacheService, LoginAttemptService, TokenBlacklistService],
  exports: [RedisCacheService, LoginAttemptService, TokenBlacklistService],
})
export class RedisCacheModule {}
