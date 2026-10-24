import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MemoryPrisma } from './memory-prisma';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly inner: PrismaClient | MemoryPrisma;

  constructor() {
    if (!process.env.DATABASE_URL) {
      const user = process.env.DB_USER ?? 'riaya';
      const password = process.env.DB_PASSWORD ?? 'riaya';
      const host = process.env.DB_HOST ?? 'localhost';
      const port = process.env.DB_PORT ?? '5432';
      const database = process.env.DB_NAME ?? 'riaya';
      process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
    this.inner = process.env.NODE_ENV === 'test' ? new MemoryPrisma() : new PrismaClient();
  }

  get user() {
    return this.inner.user as PrismaClient['user'];
  }

  get refreshToken() {
    return this.inner.refreshToken as PrismaClient['refreshToken'];
  }

  get passwordResetToken() {
    return this.inner.passwordResetToken as PrismaClient['passwordResetToken'];
  }

  $queryRawUnsafe(query: string) {
    return this.inner.$queryRawUnsafe(query);
  }

  async onModuleInit() {
    await this.inner.$connect();
  }

  async onModuleDestroy() {
    await this.inner.$disconnect();
  }
}
