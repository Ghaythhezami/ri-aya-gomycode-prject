import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { runSeed } from '../database/seeds/seed';

/** Constant-time comparison of a presented secret with the configured one. */
export function secretMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Hosted-demo only: re-seeds the fictional dataset once a day (Vercel Cron) so the
 * demo always shows a live "today". Disabled — 404 — unless DEMO_MODE=true and
 * CRON_SECRET are both set. Never enable on a deployment holding real data.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('demo')
export class DemoController {
  private readonly logger = new Logger(DemoController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('reset')
  resetFromCron(@Headers('authorization') authorization?: string) {
    return this.reset(authorization);
  }

  @Post('reset')
  @HttpCode(200)
  resetFromPost(@Headers('authorization') authorization?: string) {
    return this.reset(authorization);
  }

  private async reset(authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (process.env.DEMO_MODE !== 'true' || !secret) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    }
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!secretMatches(token, secret)) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unauthorized' });
    }
    const started = Date.now();
    await runSeed(this.prisma.rawClient, { demoReset: true, quiet: true });
    this.logger.log(`Demo dataset re-seeded in ${Date.now() - started} ms`);
    return { success: true, durationMs: Date.now() - started };
  }
}
