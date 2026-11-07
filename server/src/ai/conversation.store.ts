import { Injectable, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  AssistantConversationSummary,
  AssistantPersona,
  AssistantProposal,
} from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { CONVERSATION_LIST_LIMIT, CONVERSATION_WINDOW_DAYS, type ActorType } from './ai.constants';

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** A stored turn: the exact Claude content blocks plus the proposals shown on that turn. */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
  proposals?: AssistantProposal[];
}

export interface ActorRef {
  clinicId: string;
  type: ActorType;
  id: string;
}

export interface RenderedMessage {
  role: 'user' | 'assistant';
  text: string;
  proposals: AssistantProposal[];
}

function textOf(content: StoredMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** UI view of a conversation: tool plumbing hidden, one assistant bubble per answer. */
export function renderMessages(messages: StoredMessage[]): RenderedMessage[] {
  const out: RenderedMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const isToolResult =
        Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
      if (isToolResult) continue;
      out.push({ role: 'user', text: textOf(m.content), proposals: [] });
      continue;
    }
    const last = out[out.length - 1];
    const text = textOf(m.content);
    if (last && last.role === 'assistant') {
      last.text = [last.text, text].filter(Boolean).join('\n\n');
      last.proposals.push(...(m.proposals ?? []));
    } else {
      out.push({ role: 'assistant', text, proposals: [...(m.proposals ?? [])] });
    }
  }
  return out;
}

/** Strip UI-only fields before sending history to the API. */
export function toApiMessages(
  messages: StoredMessage[],
): Anthropic.Beta.Messages.BetaMessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

@Injectable()
export class ConversationStore {
  private lastSweep = 0;

  constructor(private readonly prisma: PrismaService) {}

  private where(actor: ActorRef, persona?: AssistantPersona) {
    return {
      clinicId: actor.clinicId,
      actorType: actor.type,
      actorId: actor.id,
      ...(persona ? { persona } : {}),
    };
  }

  /**
   * Retention: deletes this actor's conversations not updated for 30 days, and (at most once per
   * 10 minutes per instance) sweeps every actor's expired conversations in one statement.
   */
  async purgeExpired(actor: ActorRef): Promise<void> {
    const before = new Date(Date.now() - CONVERSATION_WINDOW_DAYS * 86_400_000);
    await this.prisma.aiConversation.deleteMany({
      where: { ...this.where(actor), updatedAt: { lt: before } },
    });
    if (Date.now() - this.lastSweep < 10 * 60_000) return;
    this.lastSweep = Date.now();
    await this.prisma.aiConversation.deleteMany({ where: { updatedAt: { lt: before } } });
  }

  async create(actor: ActorRef, persona: AssistantPersona, title: string) {
    return this.prisma.aiConversation.create({
      data: { ...this.where(actor), persona, title, messages: [] },
    });
  }

  /** Conversation of this actor and persona, or 404 (a foreign id looks like a missing one). */
  async load(actor: ActorRef, persona: AssistantPersona, id: string) {
    const row = await this.prisma.aiConversation.findFirst({
      where: { id, ...this.where(actor, persona) },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    return {
      ...row,
      messages: (Array.isArray(row.messages) ? row.messages : []) as unknown as StoredMessage[],
    };
  }

  async save(
    id: string,
    messages: StoredMessage[],
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id },
      data: {
        messages: messages as never,
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
      },
    });
  }

  async list(actor: ActorRef, persona: AssistantPersona): Promise<AssistantConversationSummary[]> {
    const since = new Date(Date.now() - CONVERSATION_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.aiConversation.findMany({
      where: { ...this.where(actor, persona), updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: CONVERSATION_LIST_LIMIT,
      select: { id: true, persona: true, title: true, updatedAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      persona: r.persona as AssistantPersona,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async detail(actor: ActorRef, persona: AssistantPersona, id: string) {
    const row = await this.load(actor, persona, id);
    return {
      id: row.id,
      persona: row.persona as AssistantPersona,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      messages: renderMessages(row.messages),
    };
  }

  async remove(actor: ActorRef, persona: AssistantPersona, id: string): Promise<{ success: true }> {
    const { count } = await this.prisma.aiConversation.deleteMany({
      where: { id, ...this.where(actor, persona) },
    });
    if (!count)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    return { success: true };
  }
}
