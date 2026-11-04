import { JwtService } from '@nestjs/jwt';
import { ConnectionRefusedError, TokenService, UNAUTHORIZED_REASON } from './token.service';

const SECRET = 'test-access-secret-with-at-least-32-characters';
const OTHER_SECRET = 'a-different-secret-also-32-characters-long';

const service = (): TokenService => new TokenService(new JwtService({ secret: SECRET }));

const sign = (payload: Record<string, unknown>, secret = SECRET, expiresIn = 900): string =>
  new JwtService({ secret }).sign(payload, { expiresIn });

const claims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  sub: 'user-1',
  email: 'user-1@example.test',
  clinic_id: 'clinic-1',
  role: 'RECEPTIONIST',
  ...overrides,
});

const verifyError = async (token: unknown): Promise<ConnectionRefusedError> => {
  try {
    await service().verify(token);
  } catch (error) {
    return error as ConnectionRefusedError;
  }

  throw new Error('expected verify to refuse the credential');
};

describe('TokenService', () => {
  // TEST-001 → AC-001
  it('TEST-001/AC-001: a connection with no token is refused', async () => {
    await expect(service().verify(undefined)).rejects.toBeInstanceOf(ConnectionRefusedError);
    await expect(service().verify('')).rejects.toBeInstanceOf(ConnectionRefusedError);
    await expect(service().verify(null)).rejects.toBeInstanceOf(ConnectionRefusedError);
    await expect(service().verify({ token: 'not-a-string' })).rejects.toBeInstanceOf(
      ConnectionRefusedError,
    );
  });

  // TEST-002 → AC-002
  it('TEST-002/AC-002: a bad signature and an expired token give the same generic reason', async () => {
    const forged = sign(claims(), OTHER_SECRET);
    const expired = sign(claims(), SECRET, -1);

    const forgedError = await verifyError(forged);
    const expiredError = await verifyError(expired);

    expect(forgedError).toBeInstanceOf(ConnectionRefusedError);
    expect(expiredError).toBeInstanceOf(ConnectionRefusedError);
    expect(forgedError.message).toBe(UNAUTHORIZED_REASON);
    expect(expiredError.message).toBe(UNAUTHORIZED_REASON);
    expect(forgedError.message).toBe(expiredError.message);
  });

  it('TEST-002/AC-002: a token missing a required claim is refused with the same reason', async () => {
    const error = await verifyError(sign(claims({ clinic_id: undefined })));

    expect(error.message).toBe(UNAUTHORIZED_REASON);
  });

  // TEST-003 → AC-003
  it('TEST-003/AC-003: a valid token is bound to its user, clinic, role and expiry', async () => {
    const scope = await service().verify(sign(claims()));

    expect(scope.userId).toBe('user-1');
    expect(scope.clinicId).toBe('clinic-1');
    expect(scope.role).toBe('RECEPTIONIST');
    expect(scope.email).toBe('user-1@example.test');
    expect(scope.expiresAt).toBeGreaterThan(Date.now());
  });
});
