import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  action: 'create' | 'update' | 'delete';
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  organizationId?: string | null;
  clinicId?: string | null;
}

/** The subset of the Prisma client a transaction hands to its callback. */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Append-only audit writer (FR-016, NFR-013).
 *
 * Entries are written INSIDE the caller's transaction, so a rolled-back
 * mutation leaves no audit row behind (FR-017, AC-020). There is deliberately
 * no update or delete method: the trail is append-only from the application's
 * point of view.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write one entry using an existing transaction client. */
  async record(tx: TxClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
        organizationId: entry.organizationId ?? null,
        clinicId: entry.clinicId ?? null,
      },
    });
  }

  /** Write one entry in its own transaction, for callers with no open one. */
  async recordStandalone(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
        organizationId: entry.organizationId ?? null,
        clinicId: entry.clinicId ?? null,
      },
    });
  }

  /** Read the trail for one entity, newest first. */
  async listForEntity(entity: string, entityId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
