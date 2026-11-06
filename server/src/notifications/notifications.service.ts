import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DeliveryStats,
  NotificationCategory,
  NotificationDto,
  NotificationPage,
} from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';

export interface CreateNotificationInput {
  clinicId: string;
  userId?: string | null;
  category: NotificationCategory;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  entityType?: 'appointment' | 'patient' | 'doctor' | 'queue' | null;
  entityId?: string | null;
  dedupeKey: string;
}

export interface ListNotificationsQuery {
  category?: NotificationCategory;
  unread?: boolean;
  cursor?: string;
  limit?: number;
}

type Row = {
  id: string;
  category: string;
  titleKey: string;
  bodyKey: string;
  params: Prisma.JsonValue;
  entityType: string | null;
  entityId: string | null;
  readBy: string[];
  createdAt: Date;
};

export function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [iso, id] = cursor.split('|');
  const createdAt = iso ? new Date(iso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent on `dedupeKey`: a repeated event never creates a second row. */
  async create(input: CreateNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          clinicId: input.clinicId,
          userId: input.userId ?? null,
          category: input.category,
          titleKey: input.titleKey,
          bodyKey: input.bodyKey,
          params: (input.params ?? {}) as Prisma.InputJsonValue,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          dedupeKey: input.dedupeKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  private visibleTo(clinicId: string, userId: string): Prisma.NotificationWhereInput {
    return { clinicId, OR: [{ userId: null }, { userId }] };
  }

  private toDto(row: Row, userId: string): NotificationDto {
    return {
      id: row.id,
      category: row.category as NotificationCategory,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      params: (row.params ?? {}) as Record<string, string | number>,
      entityType: row.entityType as NotificationDto['entityType'],
      entityId: row.entityId,
      read: row.readBy.includes(userId),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async unreadCount(clinicId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { ...this.visibleTo(clinicId, userId), NOT: { readBy: { has: userId } } },
    });
  }

  async list(
    clinicId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationPage> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const and: Prisma.NotificationWhereInput[] = [this.visibleTo(clinicId, userId)];
    if (query.category) and.push({ category: query.category });
    if (query.unread) and.push({ NOT: { readBy: { has: userId } } });
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.prisma.notification.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.toDto(r, userId)),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      unreadCount: await this.unreadCount(clinicId, userId),
    };
  }

  async markRead(clinicId: string, userId: string, id: string): Promise<{ success: true }> {
    const found = await this.prisma.notification.findFirst({
      where: { id, ...this.visibleTo(clinicId, userId) },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' });
    await this.prisma.notification.updateMany({
      where: { id, clinicId, NOT: { readBy: { has: userId } } },
      data: { readBy: { push: userId } },
    });
    return { success: true };
  }

  async markAllRead(clinicId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.visibleTo(clinicId, userId), NOT: { readBy: { has: userId } } },
      data: { readBy: { push: userId } },
    });
    return { updated: result.count };
  }

  async deliveryStats(clinicId: string, now = new Date()): Promise<DeliveryStats> {
    const since = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const grouped = await this.prisma.reminderDelivery.groupBy({
      by: ['status', 'channel'],
      where: {
        appointment: { clinicId },
        OR: [{ status: 'PENDING' }, { scheduledFor: { gte: since, lte: now } }],
      },
      _count: { _all: true },
    });
    const count = (status: string, channel?: string) =>
      grouped
        .filter((g) => g.status === status && (!channel || g.channel === channel))
        .reduce((sum, g) => sum + g._count._all, 0);
    const sent = count('SENT');
    const failed = count('FAILED');
    return {
      successRate: sent + failed === 0 ? 100 : Math.round((sent / (sent + failed)) * 100),
      sms: count('SENT', 'SMS'),
      email: count('SENT', 'EMAIL'),
      pending: count('PENDING'),
      failed,
    };
  }
}
