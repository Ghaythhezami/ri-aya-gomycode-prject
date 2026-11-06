import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ServiceClient } from './service-client';
import { COMMS_CLIENT } from './service-tokens';

/** Documents per import call; the comms service accepts up to 1 000 per collection. */
export const COMMS_IMPORT_BATCH = 500;

/**
 * Copies a clinic's notifications and staff chat from PostgreSQL into `riaya-comms`
 * (MongoDB). Used after the demo re-seed and by `scripts/sync-comms.ts` for a first migration.
 * Idempotent: the service upserts by id. `reset: true` first deletes the clinic's documents.
 */
@Injectable()
export class CommsSyncService {
  private readonly logger = new Logger(CommsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COMMS_CLIENT) private readonly comms: ServiceClient,
  ) {}

  get enabled(): boolean {
    return this.comms.enabled;
  }

  async syncAll(options: { reset?: boolean } = {}): Promise<Record<string, number>> {
    const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
    const totals = { clinics: clinics.length, notifications: 0, conversations: 0, messages: 0 };
    for (const clinic of clinics) {
      const counts = await this.syncClinic(clinic.id, options);
      totals.notifications += counts.notifications;
      totals.conversations += counts.conversations;
      totals.messages += counts.messages;
    }
    this.logger.log(`comms sync ${JSON.stringify(totals)}`);
    return totals;
  }

  async syncClinic(
    clinicId: string,
    options: { reset?: boolean } = {},
  ): Promise<{ notifications: number; conversations: number; messages: number }> {
    const principal = { clinicId, userId: 'system', role: 'SYSTEM', scope: 'admin' as const };
    if (options.reset) {
      await this.comms.request({ method: 'POST', path: '/v1/admin/reset', principal });
    }

    const notifications = await this.prisma.notification.findMany({ where: { clinicId } });
    const conversations = await this.prisma.chatConversation.findMany({ where: { clinicId } });
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversation: { clinicId } },
    });

    const batches = <T>(rows: T[]): T[][] =>
      Array.from({ length: Math.ceil(rows.length / COMMS_IMPORT_BATCH) }, (_, i) =>
        rows.slice(i * COMMS_IMPORT_BATCH, (i + 1) * COMMS_IMPORT_BATCH),
      );

    for (const batch of batches(conversations)) {
      await this.import(principal, {
        conversations: batch.map((c) => ({
          id: c.id,
          title: c.title,
          isGroup: c.isGroup,
          memberIds: c.memberIds,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      });
    }
    for (const batch of batches(messages)) {
      await this.import(principal, {
        messages: batch.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          body: m.body,
          readBy: m.readBy,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }
    for (const batch of batches(notifications)) {
      await this.import(principal, {
        notifications: batch.map((n) => ({
          id: n.id,
          userId: n.userId,
          category: n.category,
          titleKey: n.titleKey,
          bodyKey: n.bodyKey,
          params: n.params ?? {},
          entityType: n.entityType,
          entityId: n.entityId,
          dedupeKey: n.dedupeKey,
          readBy: n.readBy,
          createdAt: n.createdAt.toISOString(),
        })),
      });
    }
    return {
      notifications: notifications.length,
      conversations: conversations.length,
      messages: messages.length,
    };
  }

  private import(
    principal: { clinicId: string; userId: string; role: string; scope: 'admin' },
    payload: Record<string, unknown[]>,
  ): Promise<unknown> {
    return this.comms.request({
      method: 'POST',
      path: '/v1/admin/import',
      principal,
      body: { notifications: [], conversations: [], messages: [], ...payload },
      timeoutMs: 20_000,
    });
  }
}
