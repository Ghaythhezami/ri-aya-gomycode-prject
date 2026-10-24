import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and dependency status' })
  async health() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      cache: this.cache.status,
      timestamp: new Date().toISOString(),
    };
  }
}
