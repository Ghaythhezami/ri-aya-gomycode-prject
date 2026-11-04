import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContext, clinicWhere } from '../tenancy/tenant-context';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Attribution comes from the verified scope unless the caller supplies it.
   *
   * An HTTP caller never needs to pass tenant ids, and a non-HTTP caller (seed,
   * unit test) has no scope, so its explicit values still win.
   */
  private attribution(entry: AuditEntry): {
    organizationId: string | null;
    clinicId: string | null;
  } {
    const scope = this.tenant.peek();
    return {
      organizationId: entry.organizationId ?? scope?.organizationId ?? null,
      clinicId: entry.clinicId ?? scope?.clinicId ?? null,
    };
  }

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
        ...this.attribution(entry),
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
        ...this.attribution(entry),
      },
    });
  }

  /**
   * Read the trail for one entity, newest first, limited to the caller's
   * organization. A caller with no request scope (seed, unit test) is not
   * narrowed, because it has no tenant to narrow to.
   */
  async listForEntity(entity: string, entityId: string, limit = 50) {
    const scope = this.tenant.peek();

    return this.prisma.auditLog.findMany({
      where: { entity, entityId, ...(scope ? clinicWhere(scope) : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
