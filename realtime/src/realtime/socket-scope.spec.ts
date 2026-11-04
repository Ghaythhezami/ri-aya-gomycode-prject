import { clinicRoom, extractToken, userRoom } from './socket-scope';

describe('socket scope', () => {
  // TEST-003 → AC-003
  it('TEST-003/AC-003: room names are derived from token values', () => {
    expect(userRoom('user-1')).toBe('user:user-1');
    expect(clinicRoom('clinic-1')).toBe('clinic:clinic-1');
  });

  // TEST-001 → AC-001
  it('TEST-001/AC-001: no credential is extracted from an empty handshake', () => {
    expect(extractToken({})).toBeUndefined();
    expect(extractToken({ auth: {} })).toBeUndefined();
    expect(extractToken({ auth: { token: 42 } })).toBeUndefined();
    expect(extractToken({ auth: { token: '' } })).toBeUndefined();
    expect(extractToken({ headers: {} })).toBeUndefined();
  });

  // TEST-001 → AC-001
  it('TEST-001/AC-001: the handshake auth payload is the primary source', () => {
    expect(extractToken({ auth: { token: 'from-auth' }, headers: {} })).toBe('from-auth');
  });

  it('TEST-001/AC-001: a bearer header is accepted when the payload carries no token', () => {
    expect(extractToken({ auth: {}, headers: { authorization: 'Bearer from-header' } })).toBe(
      'from-header',
    );
    expect(extractToken({ headers: { authorization: ['Bearer from-array'] } })).toBe('from-array');
  });

  it('TEST-001/AC-001: a non-bearer authorization header is not a credential', () => {
    expect(extractToken({ headers: { authorization: 'Basic abc' } })).toBeUndefined();
  });
});
