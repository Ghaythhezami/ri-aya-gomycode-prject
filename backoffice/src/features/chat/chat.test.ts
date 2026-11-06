import type { ChatMessageDto } from '@riaya/shared';
import {
  conversationTitle,
  lastOwnMessageId,
  mergeMessages,
  prepareBody,
  shouldSend,
} from './chatMerge';

const m = (id: string, at: string, sender = 'u1', readByOthers = false): ChatMessageDto => ({
  id,
  conversationId: 'c',
  sender: { id: sender, name: sender, initials: 'U' },
  body: id,
  createdAt: at,
  readByOthers,
});

describe('chat merge', () => {
  it('dedupes by id, sorts ascending and lets newer data win', () => {
    const newest = [m('3', '2026-01-01T10:03:00Z', 'u1', true), m('2', '2026-01-01T10:02:00Z')];
    const older = [m('2', '2026-01-01T10:02:00Z'), m('1', '2026-01-01T10:01:00Z')];
    const merged = mergeMessages(older, newest);
    expect(merged.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(merged[2]!.readByOthers).toBe(true);
  });
  it('finds the last own message', () => {
    expect(
      lastOwnMessageId(
        [m('1', '2026-01-01T10:01:00Z'), m('2', '2026-01-01T10:02:00Z', 'u2')],
        'u1',
      ),
    ).toBe('1');
  });
  it('titles and composer rules', () => {
    expect(
      conversationTitle(
        {
          title: '',
          members: [
            { id: 'u1', name: 'Me', initials: 'M' },
            { id: 'u2', name: 'Sam', initials: 'S' },
          ],
        },
        'u1',
        'x',
      ),
    ).toBe('Sam');
    expect(shouldSend({ key: 'Enter', shiftKey: false })).toBe(true);
    expect(shouldSend({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(prepareBody('  hi ')).toBe('hi');
    expect(prepareBody('a'.repeat(2001))).toBeNull();
  });
});
