import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
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

  get organization() {
    return (this.inner as PrismaClient).organization;
  }

  get clinic() {
    return (this.inner as PrismaClient).clinic;
  }

  get userMembership() {
    return (this.inner as PrismaClient).userMembership;
  }

  get invitation() {
    return (this.inner as PrismaClient).invitation;
  }

  get auditLog() {
    return (this.inner as PrismaClient).auditLog;
  }

  get patient() {
    return (this.inner as PrismaClient).patient;
  }

  get doctor() {
    return (this.inner as PrismaClient).doctor;
  }

  get appointment() {
    return (this.inner as PrismaClient).appointment;
  }

  get room() {
    return (this.inner as PrismaClient).room;
  }

  get workingHour() {
    return (this.inner as PrismaClient).workingHour;
  }

  get doctorLeave() {
    return (this.inner as PrismaClient).doctorLeave;
  }

  get queueEntry() {
    return (this.inner as PrismaClient).queueEntry;
  }

  get clinicSettings() {
    return (this.inner as PrismaClient).clinicSettings;
  }

  get notification() {
    return (this.inner as PrismaClient).notification;
  }

  get reminderDelivery() {
    return (this.inner as PrismaClient).reminderDelivery;
  }

  get optimizationRun() {
    return (this.inner as PrismaClient).optimizationRun;
  }

  get chatConversation() {
    return (this.inner as PrismaClient).chatConversation;
  }

  get chatMessage() {
    return (this.inner as PrismaClient).chatMessage;
  }

  /** Tagged-template raw query (parameterised; used by analytics aggregations). */
  get $queryRaw() {
    return (this.inner as PrismaClient).$queryRaw.bind(this.inner as PrismaClient);
  }

  /** Interactive transaction with options (isolation level, timeout). */
  $transactionWith<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    return (this.inner as PrismaClient).$transaction(fn, options);
  }

  /** Run several operations in one transaction (used by registration and audit). */
  $transaction<T>(
    fn: (
      tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
    ) => Promise<T>,
  ): Promise<T> {
    return (this.inner as PrismaClient).$transaction(fn);
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
