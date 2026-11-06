import type { ChatMessageDto, ConversationDto, CursorPage } from '@riaya/shared';
import type { RealtimeChatMessage } from '../../lib/realtime';

/**
 * Map the raw comms message (sender id only) to the API shape using the members of the
 * conversation already in the cache. Null when the sender is unknown (caller refetches).
 */
export function toChatMessage(
  raw: RealtimeChatMessage,
  conversation: Pick<ConversationDto, 'members'>,
): ChatMessageDto | null {
  const sender = conversation.members.find((m) => m.id === raw.senderId);
  if (!sender) return null;
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    sender,
    body: raw.body,
    createdAt: raw.createdAt,
    readByOthers: Boolean(raw.readByOthers),
  };
}

/** Put a new message at the head of a (newest-first) first page, once. */
export function addMessageToPage(
  page: CursorPage<ChatMessageDto>,
  message: ChatMessageDto,
): CursorPage<ChatMessageDto> {
  if (page.items.some((m) => m.id === message.id)) return page;
  return { ...page, items: [message, ...page.items] };
}

/**
 * Conversation list after an incoming message: new last message, one more unread when someone
 * else wrote it, and the conversation moved to the top. Unchanged when the id is not in the list.
 */
export function applyIncomingMessage(
  list: ConversationDto[],
  message: Pick<ChatMessageDto, 'conversationId' | 'id' | 'body' | 'createdAt'> & {
    sender: { id: string };
  },
  meId: string | undefined,
): ConversationDto[] {
  const at = list.findIndex((c) => c.id === message.conversationId);
  if (at < 0) return list;
  const current = list[at]!;
  if (current.lastMessage && current.lastMessage.createdAt > message.createdAt) return list;
  const updated: ConversationDto = {
    ...current,
    lastMessage: {
      body: message.body,
      createdAt: message.createdAt,
      senderId: message.sender.id,
    },
    unread: message.sender.id === meId ? current.unread : current.unread + 1,
  };
  return [updated, ...list.slice(0, at), ...list.slice(at + 1)];
}

/** `chat.read` from me clears the unread badge of that conversation. */
export function clearUnread(list: ConversationDto[], conversationId: string): ConversationDto[] {
  return list.map((c) => (c.id === conversationId && c.unread > 0 ? { ...c, unread: 0 } : c));
}

/** `chat.read` from a colleague: my messages in that thread now show the read receipt. */
export function markOwnMessagesRead(
  page: CursorPage<ChatMessageDto>,
  meId: string | undefined,
): CursorPage<ChatMessageDto> {
  if (!meId || !page.items.some((m) => m.sender.id === meId && !m.readByOthers)) return page;
  return {
    ...page,
    items: page.items.map((m) =>
      m.sender.id === meId && !m.readByOthers ? { ...m, readByOthers: true } : m,
    ),
  };
}
