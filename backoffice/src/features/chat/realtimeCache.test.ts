import type { ChatMessageDto, ConversationDto } from '@riaya/shared';
import {
  addMessageToPage,
  applyIncomingMessage,
  clearUnread,
  markOwnMessagesRead,
  toChatMessage,
} from './realtimeCache';

const members = [
  { id: 'me', name: 'Me', initials: 'M' },
  { id: 'u2', name: 'Sam', initials: 'S' },
];
const conv = (id: string, unread = 0, last = '2026-11-06T09:00:00.000Z'): ConversationDto => ({
  id,
  title: '',
  isGroup: false,
  members,
  lastMessage: { body: 'old', createdAt: last, senderId: 'me' },
  unread,
});
const raw = (id: string, senderId = 'u2') => ({
  id,
  conversationId: 'c2',
  senderId,
  body: 'hi',
  readByOthers: false,
  createdAt: '2026-11-06T10:00:00.000Z',
});

describe('chat realtime cache', () => {
  it('resolves the sender from members or gives up', () => {
    expect(toChatMessage(raw('m1'), { members })!.sender.name).toBe('Sam');
    expect(toChatMessage(raw('m1', 'ghost'), { members })).toBeNull();
  });
  it('appends a message once', () => {
    const m = toChatMessage(raw('m1'), { members })!;
    const page = addMessageToPage({ items: [], nextCursor: null }, m);
    expect(page.items).toHaveLength(1);
    expect(addMessageToPage(page, m)).toBe(page);
  });
  it('updates the row, counts unread for others only and moves it to the top', () => {
    const list = [conv('c1'), conv('c2', 1)];
    const fromOther = applyIncomingMessage(list, toChatMessage(raw('m1'), { members })!, 'me');
    expect(fromOther.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(fromOther[0]!.unread).toBe(2);
    expect(fromOther[0]!.lastMessage!.senderId).toBe('u2');
    const own = applyIncomingMessage(list, toChatMessage(raw('m2', 'me'), { members })!, 'me');
    expect(own[0]!.unread).toBe(1);
    const unknown = applyIncomingMessage(
      [conv('c9')],
      toChatMessage(raw('m3'), { members })!,
      'me',
    );
    expect(unknown).toHaveLength(1);
  });
  it('clears unread and flags own messages as read', () => {
    expect(clearUnread([conv('c2', 3)], 'c2')[0]!.unread).toBe(0);
    const mine: ChatMessageDto = {
      id: 'x',
      conversationId: 'c2',
      sender: members[0]!,
      body: 'b',
      createdAt: '2026-11-06T09:00:00.000Z',
      readByOthers: false,
    };
    const next = markOwnMessagesRead({ items: [mine], nextCursor: null }, 'me');
    expect(next.items[0]!.readByOthers).toBe(true);
  });
});
