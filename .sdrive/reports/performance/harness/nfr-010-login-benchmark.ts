/**
 * NFR-010 login latency harness.
 *
 * TEMPORARY: this file exists only to produce the NFR-010 evidence report and is
 * removed immediately afterwards; it is not part of the build or the test suite.
 *
 * It measures the REAL login request path — argon2.verify -> Redis lockout read ->
 * Prisma reads + lastLoginAt write -> JWT sign -> refresh-token insert — over a real
 * HTTP socket, through the same middleware `src/main.ts` wires up (global `api`
 * prefix, helmet, cookieParser, ValidationPipe, exception filter).
 *
 * Modes
 *   load  NODE_ENV=test          repo test configuration: login throttle 1000/min,
 *                                cache = process-local strict store (no Redis)
 *   prod  NODE_ENV=production    real Redis, production throttle (10 logins/min/IP)
 *                                so the sample count must stay under that ceiling
 *
 * Usage (from `server/`):
 *   NODE_ENV=test       pnpm exec ts-node -r tsconfig-paths/register bench-login.ts load
 *   NODE_ENV=production pnpm exec ts-node -r tsconfig-paths/register bench-login.ts prod
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import type { AddressInfo } from 'net';
import { AppModule } from './src/app.module';
import { HttpExceptionFilter } from './src/common/filters/http-exception.filter';
import { PrismaService } from './src/database/prisma.service';
import { RedisCacheService } from './src/cache/redis-cache.service';

const MODE = (process.argv[2] ?? 'load') as 'load' | 'prod';
const PASSWORD = 'Nfr010Bench123!';
const USER_AGENT = 'nfr-010-benchmark';

const LEVELS =
  MODE === 'prod'
    ? [{ concurrency: 1, total: 8 }]
    : [
        { concurrency: 1, total: 50 },
        { concurrency: 5, total: 100 },
        { concurrency: 20, total: 200 },
      ];

function percentile(sortedMs: number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const index = Math.min(sortedMs.length - 1, Math.ceil(q * sortedMs.length) - 1);
  return Number(sortedMs[index].toFixed(1));
}

function git(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

interface LevelResult {
  concurrency: number;
  requests: number;
  errorCount: number;
  statuses: Record<string, number>;
  wallMs: number;
  throughputPerSec: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
}

async function runLevel(
  url: string,
  email: string,
  concurrency: number,
  total: number,
): Promise<LevelResult> {
  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  let next = 0;

  const startedAt = performance.now();

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= total) return;

      const t0 = performance.now();
      let status = 0;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
          body: JSON.stringify({ email, password: PASSWORD }),
        });
        status = res.status;
        await res.arrayBuffer();
      } catch {
        status = -1;
      }
      const ms = performance.now() - t0;

      latencies.push(ms);
      statuses[String(status)] = (statuses[String(status)] ?? 0) + 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const wallMs = performance.now() - startedAt;
  const sorted = [...latencies].sort((a, b) => a - b);
  const ok = (statuses['201'] ?? 0) + (statuses['200'] ?? 0);

  return {
    concurrency,
    requests: latencies.length,
    errorCount: latencies.length - ok,
    statuses,
    wallMs: Number(wallMs.toFixed(1)),
    throughputPerSec: Number(((latencies.length / wallMs) * 1000).toFixed(1)),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)),
    min: Number((sorted[0] ?? 0).toFixed(1)),
  };
}

async function main(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const email = `nfr010.bench.${suffix}@riaya.local`;

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(0);

  const prisma = app.get(PrismaService);
  const cache = app.get(RedisCacheService);
  const address = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/auth/login`;

  // In production mode the strict store throws until Redis reports `ready`, so every
  // login would be a 503. Wait for the connection instead of measuring the outage.
  if (MODE === 'prod') {
    const deadline = Date.now() + 15_000;
    while (cache.status !== 'up' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const organization = await prisma.organization.create({
    data: { name: `NFR-010 benchmark ${suffix}`, slug: `nfr010-bench-${suffix}` },
  });
  const clinic = await prisma.clinic.create({
    data: { organizationId: organization.id, name: 'NFR-010 clinic' },
  });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(PASSWORD),
      firstName: 'NFR',
      lastName: 'Benchmark',
      preferredLocale: 'en',
      isActive: true,
    },
  });
  await prisma.userMembership.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      clinicId: clinic.id,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  // Warm-up: pay JIT, connection-pool and module-init costs before measuring.
  for (let i = 0; i < 10; i += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    await res.arrayBuffer();
    if (res.status >= 400) {
      throw new Error(`Warm-up login failed with HTTP ${res.status}; refusing to measure.`);
    }
  }

  const levels: LevelResult[] = [];
  for (const level of LEVELS) {
    levels.push(await runLevel(url, email, level.concurrency, level.total));
  }

  const report = {
    nfr: 'NFR-010',
    requirement: 'A login request MUST complete within 400 ms p95 under normal load.',
    mode: MODE,
    nodeEnv: process.env.NODE_ENV ?? 'unset',
    cacheBackend: cache.status,
    throttle:
      MODE === 'prod'
        ? 'production: login 10/min per IP (AuthController @Throttle)'
        : 'test: login 1000/min (throttleLimit override under NODE_ENV=test)',
    endpoint: `POST /api/auth/login (${url})`,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    commit: git('git rev-parse HEAD'),
    branch: git('git rev-parse --abbrev-ref HEAD'),
    recordedAt: new Date().toISOString(),
    levels,
  };

  const outDir = join(process.cwd(), '..', '.sdrive', 'reports', 'performance');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(
    outDir,
    `nfr-010-login-benchmark-${new Date().toISOString().slice(0, 10)}-${MODE}.json`,
  );
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  // Leave the database exactly as it was found: deleting the identity cascades its
  // refresh tokens and membership; deleting the organization cascades the clinic.
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.userMembership.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.clinic.deleteMany({ where: { organizationId: organization.id } });
  await prisma.organization.delete({ where: { id: organization.id } });

  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
