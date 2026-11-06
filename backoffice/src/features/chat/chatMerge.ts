import type { ChatMessageDto, ConversationDto } from '@riaya/shared';

export const MAX_MESSAGE_LENGTH = 2000;
export const PAGE_SIZE = 30;

/**
 * Merge message lists (newest-page poll, older pages, locally sent) into one
 * chronological list. A message id appears once; when it appears in several lists the
 * later list wins, so a refreshed `readByOthers` replaces a stale copy.
 */
export function mergeMessages(...lists: ChatMessageDto[][]): ChatMessageDto[] {
  const byId = new Map<string, ChatMessageDto>();
  for (const list of lists) {
    for (const message of list) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/** Id of the newest message sent by `meId`, for the "Read" receipt. */
export function lastOwnMessageId(
  messages: ChatMessageDto[],
  meId: string | undefined,
): string | null {
  if (!meId) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.sender.id === meId) return messages[i]!.id;
  }
  return null;
}

/** Title of a conversation: its own title, or the other members' names. */
export function conversationTitle(
  conversation: Pick<ConversationDto, 'title' | 'members'>,
  meId: string | undefined,
  fallback: string,
): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  const others = conversation.members.filter((m) => m.id !== meId).map((m) => m.name);
  return others.length > 0 ? others.join(', ') : fallback;
}

export function totalUnread(conversations: Pick<ConversationDto, 'unread'>[]): number {
  return conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
}

/** Enter sends; Shift+Enter and IME composition do not. */
export function shouldSend(event: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

/** Trim and validate a draft: null when it cannot be sent. */
export function prepareBody(draft: string): string | null {
  const body = draft.trim();
  if (!body || body.length > MAX_MESSAGE_LENGTH) return null;
  return body;
}
