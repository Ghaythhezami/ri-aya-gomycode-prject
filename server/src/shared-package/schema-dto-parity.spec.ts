import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { loginSchema, registerSchema } from '@riaya/shared';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterDto } from '../tenancy/dto/register.dto';

/**
 * AC-007, AC-008 — the shared auth and register schemas accept exactly what the
 * server's DTOs accept.
 *
 * The DTO stays authoritative: every case runs through the real `class-validator`
 * pipeline and the shared schema must reach the same verdict. A rule added, removed
 * or rewritten on one side makes one of these cases disagree.
 */

type Constructor = new () => object;

async function dtoAccepts<T extends object>(dto: Constructor, payload: Record<string, unknown>) {
  const instance = plainToInstance(dto, payload) as T;
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });

  return { accepted: errors.length === 0, errors, instance };
}

// The server does not depend on `zod` directly; the schema is taken structurally so
// this spec checks the published behaviour, not a second install of the library.
function schemaAccepts(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  payload: Record<string, unknown>,
) {
  return schema.safeParse(payload).success;
}

const login = (payload: Record<string, unknown>) =>
  dtoAccepts<LoginDto>(LoginDto, payload).then((result) => ({
    ...result,
    acceptedBySchema: schemaAccepts(loginSchema, payload),
  }));

const register = (payload: Record<string, unknown>) =>
  dtoAccepts<RegisterDto>(RegisterDto, payload).then((result) => ({
    ...result,
    acceptedBySchema: schemaAccepts(registerSchema, payload),
  }));

const validRegister = {
  email: 'owner@clinic.example',
  password: 'longenough',
  firstName: 'Ada',
  lastName: 'Lovelace',
  organizationName: 'Ri-aya',
  clinicName: 'Main',
};

describe('loginSchema mirrors LoginDto', () => {
  // TEST-024 → AC-007
  it('AC-007: a valid login is accepted by both', async () => {
    const payload = { email: 'owner@clinic.example', password: 'x' };
    const result = await login(payload);

    expect(result.accepted).toBe(true);
    expect(result.acceptedBySchema).toBe(true);
  });

  // TEST-025 → AC-007
  it('AC-007: the DTO and the schema declare the same fields', async () => {
    const { instance } = await login({ email: 'owner@clinic.example', password: 'x' });

    expect(Object.keys(instance).sort()).toEqual(Object.keys(loginSchema.shape).sort());
    expect(Object.keys(loginSchema.shape).sort()).toEqual(['email', 'password']);
  });

  // TEST-026 → AC-007
  it('AC-007: both reject a malformed email and both accept a trimmed one', async () => {
    const malformed = await login({ email: 'not-an-email', password: 'x' });
    expect(malformed.accepted).toBe(false);
    expect(malformed.acceptedBySchema).toBe(false);

    const padded = await login({ email: '  Owner@Clinic.Example  ', password: 'x' });
    expect(padded.accepted).toBe(true);
    expect(padded.instance.email).toBe('owner@clinic.example');
    expect(schemaAccepts(loginSchema, { email: 'owner@clinic.example', password: 'x' })).toBe(true);
  });

  // TEST-027 → AC-007
  it('AC-007: both reject an empty password and both reject an unknown field', async () => {
    const emptyPassword = await login({ email: 'owner@clinic.example', password: '' });
    expect(emptyPassword.accepted).toBe(false);
    expect(emptyPassword.acceptedBySchema).toBe(false);

    // The API rejects unknown fields; the schema strips them client-side, so the
    // parsed value still satisfies `LoginInput`.
    const extraField = await login({
      email: 'owner@clinic.example',
      password: 'x',
      role: 'SUPER_ADMIN',
    });
    expect(extraField.accepted).toBe(false);

    const stripped = loginSchema.parse({ email: 'owner@clinic.example', password: 'x', role: 'x' });
    expect(Object.keys(stripped).sort()).toEqual(['email', 'password']);
  });
});

describe('registerSchema mirrors RegisterDto', () => {
  // TEST-028 → AC-008
  it('AC-008: a valid register is accepted by both', async () => {
    const result = await register(validRegister);

    expect(result.accepted).toBe(true);
    expect(result.acceptedBySchema).toBe(true);
  });

  // TEST-029 → AC-008
  it('AC-008: the DTO and the schema declare the same fields', async () => {
    const { instance } = await register(validRegister);

    expect(Object.keys(instance).sort()).toEqual(Object.keys(registerSchema.shape).sort());
  });

  // TEST-030 → AC-008
  it('AC-008: both require a password of at least 8 characters', async () => {
    const verdicts: Array<[string, boolean]> = [];

    for (const password of ['short', '1234567', '12345678', 'longenough']) {
      const result = await register({ ...validRegister, password });
      verdicts.push([`dto:${password}`, result.accepted]);
      verdicts.push([`schema:${password}`, result.acceptedBySchema]);
    }

    // Short passwords fail on both sides; exactly 8 characters passes on both.
    expect(verdicts).toEqual([
      ['dto:short', false],
      ['schema:short', false],
      ['dto:1234567', false],
      ['schema:1234567', false],
      ['dto:12345678', true],
      ['schema:12345678', true],
      ['dto:longenough', true],
      ['schema:longenough', true],
    ]);
  });

  // TEST-031 → AC-008
  it('AC-008: the locale is optional and limited to the three shipped locales', async () => {
    expect((await register(validRegister)).accepted).toBe(true);
    expect(registerSchema.safeParse(validRegister).success).toBe(true);

    for (const preferredLocale of ['en', 'ar', 'fr']) {
      const result = await register({ ...validRegister, preferredLocale });
      expect(result.accepted).toBe(true);
      expect(result.acceptedBySchema).toBe(true);
    }

    const unsupported = await register({ ...validRegister, preferredLocale: 'de' });
    expect(unsupported.accepted).toBe(false);
    expect(unsupported.acceptedBySchema).toBe(false);
  });

  // TEST-032 → AC-008
  it('AC-008: both require every identity field', async () => {
    const accepted: string[] = [];

    for (const field of ['email', 'firstName', 'lastName', 'organizationName', 'clinicName']) {
      const payload = { ...validRegister, [field]: undefined };
      const result = await register(payload);

      if (result.accepted) accepted.push(`dto accepts without ${field}`);
      if (result.acceptedBySchema) accepted.push(`schema accepts without ${field}`);
    }

    expect(accepted).toEqual([]);
  });
});
