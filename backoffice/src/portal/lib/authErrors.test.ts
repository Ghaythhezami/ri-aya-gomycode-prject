import { authErrorKind, lockoutMinutes } from './authErrors';

const http = (status: number, code?: string) => ({ response: { status, data: { code } } });

describe('authErrorKind', () => {
  it('maps the documented portal auth codes', () => {
    expect(authErrorKind(http(401, 'INVALID_CREDENTIALS'))).toBe('invalid');
    expect(authErrorKind(http(423, 'ACCOUNT_LOCKED'))).toBe('locked');
    expect(authErrorKind(http(409, 'ACCOUNT_EXISTS'))).toBe('exists');
    expect(authErrorKind(http(429, 'RATE_LIMITED'))).toBe('rate');
    expect(authErrorKind(http(429))).toBe('rate');
    expect(authErrorKind(http(400, 'VALIDATION_FAILED'))).toBe('validation');
    expect(authErrorKind(http(400, 'INVITE_EXPIRED'))).toBe('invite');
    expect(authErrorKind(http(403, 'FORBIDDEN'))).toBe('forbidden');
    expect(authErrorKind(http(500))).toBe('generic');
  });
  it('treats a response-less failure as offline', () => {
    expect(authErrorKind(new Error('Network Error'))).toBe('offline');
  });
});

describe('lockoutMinutes', () => {
  it('reads retryAfterSeconds from the body or details and rounds up', () => {
    expect(lockoutMinutes({ response: { data: { retryAfterSeconds: 61 } } })).toBe(2);
    expect(lockoutMinutes({ response: { data: { details: { retryAfterSeconds: 900 } } } })).toBe(
      15,
    );
    expect(lockoutMinutes({ response: { data: {} } })).toBeNull();
  });
});

describe('new portal codes', () => {
  it('maps INVALID_TOKEN to invite and PORTAL_DISABLED to disabled', () => {
    expect(authErrorKind(http(400, 'INVALID_TOKEN'))).toBe('invite');
    expect(authErrorKind(http(403, 'PORTAL_DISABLED'))).toBe('disabled');
  });
});
