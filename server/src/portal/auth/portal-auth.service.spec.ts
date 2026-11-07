import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PortalAuthService } from './portal-auth.service';
import { PortalTokenService } from './portal-token.service';

jest.mock('argon2', () => {
  const actual = jest.requireActual('argon2');
  return { ...actual, hash: jest.fn(actual.hash) };
});

const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-access-secret-change-me-32chars' });
const CLINIC = 'c0000000-0000-4000-8000-000000000001';
const PASSWORD = 'Str0ng!Passw0rd';

interface Row {
  [k: string]: any;
}

/** Minimal in-memory Prisma double for the tables the portal auth touches. */
function makeDb(opts: { settings?: Row | null; existingPatients?: Row[] } = {}) {
  const db = {
    patients: [...(opts.existingPatients ?? [])] as Row[],
    accounts: [] as Row[],
    refresh: [] as Row[],
    invites: [] as Row[],
    audits: [] as Row[],
    resets: [] as Row[],
  };
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const withPatient = (a: Row | undefined) =>
    a ? { ...a, patient: db.patients.find((p) => p.id === a.patientId) } : null;

  const prisma: Row = {
    clinic: {
      findUnique: jest.fn(async () => ({
        id: CLINIC,
        organizationId: 'org-1',
        name: 'Clinic',
        nameI18n: {},
      })),
    },
    clinicSettings: {
      findUnique: jest.fn(async () =>
        opts.settings === undefined
          ? { patientPortalEnabled: true, patientSelfRegistration: true, defaultLanguage: 'en' }
          : opts.settings,
      ),
    },
    patient: {
      findFirst: jest.fn(async ({ where }: Row) =>
        db.patients.find((p) => p.id === where.id && p.clinicId === where.clinicId),
      ),
      findMany: jest.fn(async ({ where }: Row) =>
        db.patients.filter(
          (p) => p.dateOfBirth.getTime() === where.dateOfBirth.getTime() && p.status === 'ACTIVE',
        ),
      ),
    },
    patientAccount: {
      findUnique: jest.fn(async ({ where }: Row) => {
        const a = db.accounts.find((x) =>
          where.clinicId_email
            ? x.clinicId === where.clinicId_email.clinicId && x.email === where.clinicId_email.email
            : where.id
              ? x.id === where.id
              : x.patientId === where.patientId,
        );
        return withPatient(a);
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: Row) =>
        withPatient(db.accounts.find((x) => x.id === where.id)),
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        Object.assign(
          db.accounts.find((x) => x.id === where.id)!,
          data,
        );
      }),
    },
    patientRefreshToken: {
      create: jest.fn(async ({ data }: Row) => {
        db.refresh.push({ id: id('rt'), revokedAt: null, ...data });
      }),
      findUnique: jest.fn(async ({ where }: Row) =>
        db.refresh.find((r) => r.tokenHash === where.tokenHash),
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hits = db.refresh.filter(
          (r) =>
            (where.id
              ? r.id === where.id
              : where.accountId
                ? r.accountId === where.accountId
                : r.familyId === where.familyId) && r.revokedAt === null,
        );
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      }),
    },
    patientPasswordResetToken: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: id('prt'), usedAt: null, createdAt: new Date(), ...data };
        db.resets.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: Row) =>
        db.resets.find((r) => r.tokenHash === where.tokenHash),
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hits = db.resets.filter(
          (r) =>
            (where.id ? r.id === where.id : r.accountId === where.accountId) &&
            r.usedAt === null &&
            (!where.expiresAt || r.expiresAt.getTime() > where.expiresAt.gt.getTime()),
        );
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      }),
    },
    patientInvite: {
      findUnique: jest.fn(async ({ where }: Row) =>
        db.invites.find((i) => i.tokenHash === where.tokenHash),
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hit = db.invites.find((i) => i.id === where.id && i.consumedAt === null);
        if (!hit) return { count: 0 };
        Object.assign(hit, data);
        return { count: 1 };
      }),
    },
    $transactionWith: jest.fn(async (fn: (tx: Row) => unknown) => {
      const tx: Row = {
        $queryRaw: jest.fn(async () => [{ max: db.patients.length }]),
        patient: {
          ...prisma.patient,
          findFirst: jest.fn(async ({ where }: Row) =>
            db.patients.find((p) => p.id === where.id && p.clinicId === where.clinicId),
          ),
          create: jest.fn(async ({ data }: Row) => {
            const row = { id: id('pat'), status: 'ACTIVE', contactPreference: 'SMS', ...data };
            db.patients.push(row);
            return row;
          }),
        },
        patientAccount: {
          ...prisma.patientAccount,
          create: jest.fn(async ({ data }: Row) => {
            if (db.accounts.some((a) => a.clinicId === data.clinicId && a.email === data.email)) {
              throw Object.assign(new Error('unique'), { code: 'P2002' });
            }
            const row = { id: id('acc'), isActive: true, ...data };
            db.accounts.push(row);
            return row;
          }),
        },
        patientPasswordResetToken: prisma.patientPasswordResetToken,
        patientRefreshToken: prisma.patientRefreshToken,
        patientInvite: {
          updateMany: jest.fn(async ({ where, data }: Row) => {
            const hit = db.invites.find(
              (i) =>
                i.id === where.id &&
                i.consumedAt === null &&
                i.expiresAt.getTime() > where.expiresAt.gt.getTime(),
            );
            if (!hit) return { count: 0 };
            Object.assign(hit, data);
            return { count: 1 };
          }),
        },
      };
      return fn(tx);
    }),
  };
  return { db, prisma };
}

function makeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    incrementStrict: jest.fn(async (k: string) => {
      store.set(k, (store.get(k) ?? 0) + 1);
      return store.get(k)!;
    }),
    setStrict: jest.fn(async (k: string, v: number) => void store.set(k, v)),
    delStrict: jest.fn(async (k: string) => void store.delete(k)),
    ttlStrict: jest.fn(async (k: string) =>
      (k.startsWith('portal:lock:') || k.startsWith('portal:lock-email:')) && store.has(k)
        ? 900
        : 0,
    ),
  };
}

function setup(opts: Parameters<typeof makeDb>[0] = {}) {
  const { db, prisma } = makeDb(opts);
  const redis = makeRedis();
  const audit = {
    record: jest.fn(async (_tx: unknown, e: Row) => void db.audits.push(e)),
  };
  const notifications = { create: jest.fn(async () => undefined) };
  const mail = {
    sendPortalPasswordReset: jest.fn(async (_params: Row) => undefined),
  };
  const tokens = new PortalTokenService(new JwtService({}), config, prisma as never);
  const service = new PortalAuthService(
    prisma as never,
    tokens,
    redis as never,
    audit as never,
    notifications as never,
    mail as never,
    new ConfigService({ BACKOFFICE_URL: 'https://app.example' }),
  );
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
  return { db, prisma, redis, notifications, tokens, service, mail, res: res as any };
}

const registerDto = (over: Row = {}) =>
  ({
    clinicId: CLINIC,
    email: 'sara@example.com',
    password: PASSWORD,
    firstNameI18n: { en: 'Sara', ar: 'سارة' },
    lastNameI18n: { en: 'Haddad' },
    dateOfBirth: '1990-04-21',
    phone: '+961 70 123 456',
    preferredLocale: 'en',
    acceptPrivacy: true,
    ...over,
  }) as never;

describe('PortalAuthService.register', () => {
  it('creates a PORTAL patient and an account, sets the cookie and audits', async () => {
    const { service, db, res } = setup();
    const out = await service.register(registerDto({ aiConsent: true }), res);

    expect(out.accessToken).toEqual(expect.any(String));
    expect(out.me.email).toBe('sara@example.com');
    expect(out.me.aiConsent).toBe(true);
    expect(db.patients[0]).toMatchObject({
      source: 'PORTAL',
      firstName: 'Sara',
      possibleDuplicateOfId: null,
      code: 'P-001',
    });
    expect(db.patients[0]!.searchText).toContain('سارة');
    expect(db.accounts[0]).toMatchObject({ clinicId: CLINIC, privacyAcceptedAt: expect.any(Date) });
    expect(db.accounts[0]!.passwordHash).not.toContain(PASSWORD);
    expect(res.cookie).toHaveBeenCalledWith(
      'portal_refresh',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/portal/auth' }),
    );
    expect(db.audits[0]).toMatchObject({ entity: 'patient_account', action: 'create' });
  });

  it('creates self-registered accounts unverified (emailVerifiedAt null, me.verified false)', async () => {
    const { service, db, res } = setup();
    const out = await service.register(registerDto(), res);
    expect(db.accounts[0]!.emailVerifiedAt ?? null).toBeNull();
    expect(out.me.verified).toBe(false);
  });

  it('hashes the password before checking for an existing account (equal timing)', async () => {
    const { service, res, prisma } = setup();
    await service.register(registerDto(), res);
    (argon2.hash as jest.Mock).mockClear();
    prisma.patientAccount.findUnique.mockClear();
    await expect(service.register(registerDto(), res)).rejects.toMatchObject({ status: 409 });
    const hashCall = (argon2.hash as jest.Mock).mock.invocationCallOrder[0]!;
    const lookupCall = prisma.patientAccount.findUnique.mock.invocationCallOrder[0]!;
    expect(hashCall).toBeLessThan(lookupCall);
  });

  it('flags a same phone + birth date record as a possible duplicate and never links it', async () => {
    const existing = {
      id: 'pat-old',
      clinicId: CLINIC,
      status: 'ACTIVE',
      phone: '70123456',
      dateOfBirth: new Date('1990-04-21T00:00:00.000Z'),
    };
    const { service, db, res, notifications } = setup({ existingPatients: [existing] });
    // 961 prefix differs from the stored local number, so use the identical digits instead.
    await service.register(registerDto({ phone: '70 123 456' }), res);

    const created = db.patients.find((p) => p.id !== 'pat-old')!;
    expect(created.possibleDuplicateOfId).toBe('pat-old');
    expect(db.accounts[0]!.patientId).toBe(created.id);
    expect(db.accounts[0]!.patientId).not.toBe('pat-old');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'SYSTEM',
        dedupeKey: `portal.duplicate:${created.id}`,
      }),
    );
  });

  it('does not flag when only the phone matches', async () => {
    const existing = {
      id: 'pat-old',
      clinicId: CLINIC,
      status: 'ACTIVE',
      phone: '70123456',
      dateOfBirth: new Date('1985-01-01T00:00:00.000Z'),
    };
    const { service, db, res, notifications } = setup({ existingPatients: [existing] });
    await service.register(registerDto({ phone: '70123456' }), res);
    expect(db.patients.find((p) => p.id !== 'pat-old')!.possibleDuplicateOfId).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('answers a generic 409 ACCOUNT_EXISTS for a taken e-mail and creates nothing', async () => {
    const { service, db, res } = setup();
    await service.register(registerDto(), res);
    const before = db.patients.length;
    await expect(
      service.register(registerDto({ firstNameI18n: { en: 'Other' } }), res),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ACCOUNT_EXISTS' } });
    expect(db.patients).toHaveLength(before);
  });

  it('answers 403 when self-registration or the portal is disabled', async () => {
    for (const settings of [
      { patientPortalEnabled: true, patientSelfRegistration: false, defaultLanguage: 'en' },
      { patientPortalEnabled: false, patientSelfRegistration: true, defaultLanguage: 'en' },
    ]) {
      const { service, db, res } = setup({ settings });
      await expect(service.register(registerDto(), res)).rejects.toMatchObject({ status: 403 });
      expect(db.patients).toHaveLength(0);
    }
  });

  it('rejects a weak password with WEAK_PASSWORD', async () => {
    const { service, res } = setup();
    await expect(
      service.register(registerDto({ password: 'weakpassword1' }), res),
    ).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
  });
});

describe('PortalAuthService.acceptInvite', () => {
  const RAW = 'invite-token-invite-token-0001';
  const invite = (over: Row = {}) => ({
    id: 'inv-1',
    clinicId: CLINIC,
    patientId: 'pat-9',
    tokenHash: createHash('sha256').update(RAW).digest('hex'),
    expiresAt: new Date(Date.now() + 3600_000),
    consumedAt: null,
    ...over,
  });
  const patient = {
    id: 'pat-9',
    clinicId: CLINIC,
    status: 'ACTIVE',
    firstName: 'Omar',
    lastName: 'K',
    firstNameI18n: {},
    lastNameI18n: {},
    phone: '1',
    dateOfBirth: new Date('1980-01-01T00:00:00Z'),
    contactPreference: 'SMS',
  };
  const dto = {
    token: RAW,
    dateOfBirth: '1980-01-01',
    email: 'omar@example.com',
    password: PASSWORD,
    acceptPrivacy: true,
  };

  it('links a new account to the invited patient and consumes the invite once', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite());
    const out = await service.acceptInvite(dto as never, res);
    expect(out.me.patientId).toBe('pat-9');
    expect(db.invites[0]!.consumedAt).toBeInstanceOf(Date);
    await expect(service.acceptInvite(dto as never, res)).rejects.toMatchObject({
      response: { code: 'INVALID_TOKEN' },
    });
    expect(db.accounts).toHaveLength(1);
  });

  it('creates the invite account verified and notifies staff with the portalLinked template', async () => {
    const { service, db, res, notifications } = setup({
      existingPatients: [{ ...patient, code: 'P-009' }],
    });
    db.invites.push(invite());
    const out = await service.acceptInvite(dto as never, res);
    expect(out.me.verified).toBe(true);
    expect(db.accounts[0]!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC,
        category: 'SYSTEM',
        titleKey: 'notifications.templates.portalLinked.title',
        bodyKey: 'notifications.templates.portalLinked.body',
        params: { patient: 'P-009' },
        dedupeKey: 'portal.linked:pat-9',
      }),
    );
  });

  it('rejects a wrong or missing birth date with the generic INVALID_TOKEN and creates nothing', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite());
    for (const dateOfBirth of ['1980-01-02', undefined, '']) {
      await expect(
        service.acceptInvite({ ...dto, dateOfBirth } as never, res),
      ).rejects.toMatchObject({ status: 400, response: { code: 'INVALID_TOKEN' } });
    }
    expect(db.accounts).toHaveLength(0);
    expect(db.invites[0]!.consumedAt).toBeNull();
  });

  it('revokes the invite after 5 wrong birth dates, even for the right date afterwards', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite());
    for (let i = 0; i < 5; i++) {
      await expect(
        service.acceptInvite({ ...dto, dateOfBirth: '1999-09-09' } as never, res),
      ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    }
    expect(db.invites[0]!.consumedAt).toBeInstanceOf(Date);
    await expect(service.acceptInvite(dto as never, res)).rejects.toMatchObject({
      response: { code: 'INVALID_TOKEN' },
    });
    expect(db.accounts).toHaveLength(0);
  });

  it('claims atomically: two concurrent accepts produce exactly one account', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite());
    const results = await Promise.allSettled([
      service.acceptInvite(dto as never, res),
      service.acceptInvite({ ...dto, email: 'other@example.com' } as never, res),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.accounts).toHaveLength(1);
  });

  it('rejects an expired or unknown invite', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.acceptInvite(dto as never, res)).rejects.toMatchObject({
      response: { code: 'INVALID_TOKEN' },
    });
    await expect(
      service.acceptInvite({ ...dto, token: 'nope-nope-nope-nope-nope' } as never, res),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('rejects when the patient already has an account', async () => {
    const { service, db, res } = setup({ existingPatients: [patient] });
    db.invites.push(invite());
    db.accounts.push({ id: 'acc-x', clinicId: CLINIC, patientId: 'pat-9', email: 'a@b.c' });
    await expect(service.acceptInvite(dto as never, res)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACCOUNT_EXISTS' },
    });
  });
});

describe('PortalAuthService.login, refresh and logout', () => {
  async function registered() {
    const ctx = setup();
    await ctx.service.register(registerDto(), ctx.res);
    ctx.res.cookie.mockClear();
    return ctx;
  }
  const login = (password = PASSWORD) =>
    ({ clinicId: CLINIC, email: 'sara@example.com', password }) as never;

  it('signs in with valid credentials', async () => {
    const { service, res } = await registered();
    const out = await service.login(login(), res);
    expect(out.me.email).toBe('sara@example.com');
    expect(res.cookie).toHaveBeenCalledTimes(1);
  });

  it('answers a generic INVALID_CREDENTIALS for a wrong password and an unknown account', async () => {
    const { service, res } = await registered();
    await expect(service.login(login('Wrong!Passw0rd1'), res)).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    await expect(
      service.login(
        { clinicId: CLINIC, email: 'nobody@example.com', password: PASSWORD } as never,
        res,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('locks after 5 failures (portal:fail: / portal:lock: keys), even with the right password', async () => {
    const { service, res, redis } = await registered();
    for (let i = 0; i < 5; i++) {
      await expect(service.login(login('Wrong!Passw0rd1'), res)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    }
    expect([...redis.store.keys()].some((k) => k.startsWith('portal:lock:'))).toBe(true);
    await expect(service.login(login(), res)).rejects.toMatchObject({
      status: 401,
      response: { code: 'ACCOUNT_LOCKED' },
    });
  });

  it('locks one IP after 5 failures without locking the owner on another IP', async () => {
    const { service, res } = await registered();
    for (let i = 0; i < 5; i++) {
      await expect(service.login(login('Wrong!Passw0rd1'), res, '10.0.0.1')).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    }
    await expect(service.login(login(), res, '10.0.0.1')).rejects.toMatchObject({
      response: { code: 'ACCOUNT_LOCKED' },
    });
    await expect(service.login(login(), res, '10.0.0.2')).resolves.toBeDefined();
  });

  it('locks the e-mail for every IP after 20 failures spread over many IPs', async () => {
    const { service, res } = await registered();
    for (let i = 0; i < 20; i++) {
      await expect(
        service.login(login('Wrong!Passw0rd1'), res, `10.0.1.${i}`),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }
    await expect(service.login(login(), res, '10.9.9.9')).rejects.toMatchObject({
      response: { code: 'ACCOUNT_LOCKED' },
    });
  });

  it('rotates the refresh token and revokes the whole family when an old one is replayed', async () => {
    const { service, res, db } = await registered();
    await service.login(login(), res);
    const first = res.cookie.mock.calls.at(-1)![1] as string;

    const rotated = await service.refresh(first, res);
    expect(rotated.accessToken).toEqual(expect.any(String));
    const second = res.cookie.mock.calls.at(-1)![1] as string;
    expect(second).not.toBe(first);
    const family = db.refresh.find(
      (r) => r.tokenHash === createHash('sha256').update(first).digest('hex'),
    )!;
    expect(family.revokedAt).toBeInstanceOf(Date);

    // Replaying the rotated-out token is reuse: the new token dies with its family.
    await expect(service.refresh(first, res)).rejects.toMatchObject({
      response: { code: 'TOKEN_REUSE' },
    });
    await expect(service.refresh(second, res)).rejects.toMatchObject({ status: 401 });
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('logout revokes the family and clears the cookie', async () => {
    const { service, res } = await registered();
    await service.login(login(), res);
    const token = res.cookie.mock.calls.at(-1)![1] as string;
    await expect(service.logout(token, res)).resolves.toEqual({ success: true });
    expect(res.clearCookie).toHaveBeenCalledWith(
      'portal_refresh',
      expect.objectContaining({ path: '/api/portal/auth' }),
    );
    await expect(service.refresh(token, res)).rejects.toMatchObject({ status: 401 });
  });

  it('argon2 hashes are verifiable (sanity)', async () => {
    const h = await argon2.hash(PASSWORD);
    expect(await argon2.verify(h, PASSWORD)).toBe(true);
  });
});

describe('PortalAuthService.forgotPassword and resetPassword', () => {
  const NEW_PASSWORD = 'An0ther!Passw0rd';
  const forgot = (email = 'sara@example.com') => ({ clinicId: CLINIC, email }) as never;
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');

  async function registered() {
    const ctx = setup();
    await ctx.service.register(registerDto({ preferredLocale: 'fr' }), ctx.res);
    return ctx;
  }
  /** Requests a reset and returns the raw token from the mailed fragment link. */
  async function requestToken(ctx: Awaited<ReturnType<typeof registered>>) {
    await ctx.service.forgotPassword(forgot());
    const url = ctx.mail.sendPortalPasswordReset.mock.calls.at(-1)![0].resetUrl as string;
    return url.split('#token=')[1]!;
  }

  it('answers the same for an existing and an unknown account', async () => {
    const ctx = await registered();
    const known = await ctx.service.forgotPassword(forgot());
    const unknown = await ctx.service.forgotPassword(forgot('nobody@example.com'));
    expect(known).toEqual({ success: true });
    expect(unknown).toEqual(known);
    expect(ctx.mail.sendPortalPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('mails a fragment link with the clinic name and account locale; stores only the hash', async () => {
    const ctx = await registered();
    const raw = await requestToken(ctx);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.mail.sendPortalPasswordReset).toHaveBeenCalledWith({
      email: 'sara@example.com',
      resetUrl: `https://app.example/portal/reset-password#token=${raw}`,
      clinicName: 'Clinic',
      locale: 'fr',
    });
    expect(ctx.db.resets).toHaveLength(1);
    expect(ctx.db.resets[0]!.tokenHash).toBe(sha(raw));
    expect(JSON.stringify(ctx.db.resets)).not.toContain(raw);
    const ttl = ctx.db.resets[0]!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 60_000);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000);
  });

  it('invalidates earlier unused tokens', async () => {
    const ctx = await registered();
    const first = await requestToken(ctx);
    await requestToken(ctx);
    await expect(
      ctx.service.resetPassword({ token: first, password: NEW_PASSWORD } as never),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('still succeeds when the mail transport fails', async () => {
    const ctx = await registered();
    ctx.mail.sendPortalPasswordReset.mockRejectedValueOnce(new Error('provider down'));
    await expect(ctx.service.forgotPassword(forgot())).resolves.toEqual({ success: true });
  });

  it('rejects an expired token', async () => {
    const ctx = await registered();
    const raw = await requestToken(ctx);
    ctx.db.resets[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(
      ctx.service.resetPassword({ token: raw, password: NEW_PASSWORD } as never),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INVALID_TOKEN' } });
  });

  it('rejects an unknown token', async () => {
    const ctx = await registered();
    await expect(
      ctx.service.resetPassword({ token: 'z'.repeat(64), password: NEW_PASSWORD } as never),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a weak password without consuming the token', async () => {
    const ctx = await registered();
    const raw = await requestToken(ctx);
    await expect(
      ctx.service.resetPassword({ token: raw, password: 'weakpassword1' } as never),
    ).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    expect(ctx.db.resets[0]!.usedAt).toBeNull();
  });

  it('sets the new password, is single use, revokes refresh tokens, clears lockout and audits', async () => {
    const ctx = await registered();
    await ctx.service.login(
      { clinicId: CLINIC, email: 'sara@example.com', password: PASSWORD } as never,
      ctx.res,
    );
    const session = ctx.res.cookie.mock.calls.at(-1)![1] as string;
    const emailKey = `${CLINIC}:sara@example.com`;
    ctx.redis.store.set(`portal:lock-email:${emailKey}`, 1);
    ctx.redis.store.set(`portal:fail-email:${emailKey}`, 3);

    const raw = await requestToken(ctx);
    await expect(
      ctx.service.resetPassword({ token: raw, password: NEW_PASSWORD } as never),
    ).resolves.toEqual({ success: true });

    expect(await argon2.verify(ctx.db.accounts[0]!.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(ctx.db.resets[0]!.usedAt).toBeInstanceOf(Date);
    expect(ctx.db.refresh.every((r) => r.revokedAt instanceof Date)).toBe(true);
    await expect(ctx.service.refresh(session, ctx.res)).rejects.toMatchObject({ status: 401 });
    expect(ctx.redis.store.has(`portal:lock-email:${emailKey}`)).toBe(false);
    expect(ctx.redis.store.has(`portal:fail-email:${emailKey}`)).toBe(false);
    expect(ctx.db.audits.at(-1)).toMatchObject({
      entity: 'patient_account',
      action: 'update',
      after: { event: 'password_reset' },
    });

    await expect(
      ctx.service.resetPassword({ token: raw, password: NEW_PASSWORD } as never),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    await expect(
      ctx.service.login(
        { clinicId: CLINIC, email: 'sara@example.com', password: NEW_PASSWORD } as never,
        ctx.res,
      ),
    ).resolves.toBeDefined();
  });
});
