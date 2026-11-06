import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ChatMessageDto, ConversationDto, CursorPage, PersonRef } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { toPersonRef } from '../common/mappers';
import { decodeCursor, encodeCursor } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async people(ids: string[]): Promise<Map<string, PersonRef>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, toPersonRef(u)]));
  }

  async staff(clinicId: string): Promise<PersonRef[]> {
    const rows = await this.prisma.userMembership.findMany({
      where: { clinicId, status: 'ACTIVE', user: { isActive: true } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((r) => toPersonRef(r.user)).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async activeMemberCount(clinicId: string, ids: string[]): Promise<number> {
    return this.prisma.userMembership.count({
      where: { clinicId, status: 'ACTIVE', userId: { in: ids } },
    });
  }

  private async memberConversation(clinicId: string, userId: string, id: string) {
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id, clinicId } });
    if (!conversation)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    if (!conversation.memberIds.includes(userId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this conversation',
      });
    }
    return conversation;
  }

  private titleOf(
    conversation: { title: string | null; isGroup: boolean; memberIds: string[] },
    userId: string,
    people: Map<string, PersonRef>,
  ): string {
    if (conversation.title) return conversation.title;
    const others = conversation.memberIds
      .filter((m) => m !== userId)
      .map((m) => people.get(m)?.name ?? '');
    return others.filter(Boolean).join(', ');
  }

  async list(clinicId: string, userId: string): Promise<ConversationDto[]> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { clinicId, memberIds: { has: userId } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversations.length) return [];
    const ids = conversations.map((c) => c.id);
    const [people, lastMessages, unread] = await Promise.all([
      this.people(conversations.flatMap((c) => c.memberIds)),
      this.prisma.chatMessage.findMany({
        where: { conversationId: { in: ids } },
        orderBy: [{ conversationId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        distinct: ['conversationId'],
      }),
      this.prisma.chatMessage.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: ids },
          senderId: { not: userId },
          NOT: { readBy: { has: userId } },
        },
        _count: { _all: true },
      }),
    ]);
    const last = new Map(lastMessages.map((m) => [m.conversationId, m]));
    const unreadBy = new Map(unread.map((u) => [u.conversationId, u._count._all]));
    return conversations.map((c) => {
      const message = last.get(c.id);
      return {
        id: c.id,
        title: this.titleOf(c, userId, people),
        isGroup: c.isGroup,
        members: c.memberIds.map((m) => people.get(m)).filter((p): p is PersonRef => !!p),
        lastMessage: message
          ? {
              body: message.body,
              createdAt: message.createdAt.toISOString(),
              senderId: message.senderId,
            }
          : null,
        unread: unreadBy.get(c.id) ?? 0,
      };
    });
  }

  async create(clinicId: string, userId: string, input: { memberIds: string[]; title?: string }) {
    const members = [...new Set([userId, ...input.memberIds])].sort();
    if (members.length < 2) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A conversation needs at least two members',
      });
    }
    if ((await this.activeMemberCount(clinicId, members)) !== members.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Every member must be active staff of this clinic',
      });
    }
    const isGroup = members.length > 2;
    let id: string | undefined;
    if (!isGroup && !input.title) {
      const existing = await this.prisma.chatConversation.findMany({
        where: { clinicId, isGroup: false, memberIds: { hasEvery: members } },
      });
      id = existing.find((c) => c.memberIds.length === 2)?.id;
    }
    if (!id) {
      const created = await this.prisma.chatConversation.create({
        data: { clinicId, memberIds: members, isGroup, title: input.title?.trim() || null },
      });
      id = created.id;
    }
    const all = await this.list(clinicId, userId);
    return all.find((c) => c.id === id)!;
  }

  async messages(
    clinicId: string,
    userId: string,
    conversationId: string,
    query: { before?: string; limit?: number },
  ): Promise<CursorPage<ChatMessageDto>> {
    await this.memberConversation(clinicId, userId, conversationId);
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 50);
    const cursor = query.before ? decodeCursor(query.before) : null;
    if (query.before && !cursor) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid cursor' });
    }
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const people = await this.people(page.map((m) => m.senderId));
    const last = page[page.length - 1];
    return {
      items: page.map((m) => this.toDto(m, people)),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private toDto(
    m: {
      id: string;
      conversationId: string;
      senderId: string;
      body: string;
      readBy: string[];
      createdAt: Date;
    },
    people: Map<string, PersonRef>,
  ): ChatMessageDto {
    return {
      id: m.id,
      conversationId: m.conversationId,
      sender: people.get(m.senderId) ?? { id: m.senderId, name: '', initials: '?' },
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readByOthers: m.readBy.some((r) => r !== m.senderId),
    };
  }

  async post(
    clinicId: string,
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<ChatMessageDto> {
    await this.memberConversation(clinicId, userId, conversationId);
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Message must be 1 to 2000 characters',
      });
    }
    const message = await this.prisma.chatMessage.create({
      data: { conversationId, senderId: userId, body: text, readBy: [userId] },
    });
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return this.toDto(message, await this.people([userId]));
  }

  async markRead(
    clinicId: string,
    userId: string,
    conversationId: string,
  ): Promise<{ success: true }> {
    await this.memberConversation(clinicId, userId, conversationId);
    await this.prisma.chatMessage.updateMany({
      where: { conversationId, NOT: { readBy: { has: userId } } },
      data: { readBy: { push: userId } },
    });
    return { success: true };
  }
}
