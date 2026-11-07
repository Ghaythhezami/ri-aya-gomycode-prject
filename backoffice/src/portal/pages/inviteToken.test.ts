import { readInviteToken } from './InvitePage';

describe('readInviteToken', () => {
  it('reads the fragment token and scrubs it from the URL', () => {
    window.history.replaceState(null, '', '/portal/invite#token=abc123');
    expect(readInviteToken()).toBe('abc123');
    expect(window.location.hash).toBe('');
  });
  it('falls back to ?token= and removes it', () => {
    window.history.replaceState(null, '', '/portal/invite?token=old');
    expect(readInviteToken()).toBe('old');
    expect(window.location.search).toBe('');
  });
});
