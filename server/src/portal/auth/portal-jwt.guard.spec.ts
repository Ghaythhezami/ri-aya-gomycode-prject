import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { PatientContext } from './patient-context';
import { PortalJwtGuard } from './portal-jwt.guard';
import { PortalTokenService } from './portal-token.service';

const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-access-secret-change-me-32chars' });
const jwt = new JwtService({});

const account = {
  id: 'acc-1',
  clinicId: 'clinic-1',
  patientId: 'pat-1',
  isActive: true,
  preferredLocale: 'fr',
  patient: { status: 'ACTIVE', clinicId: 'clinic-1' },
};

function setup(row: unknown = account, portalEnabled = true) {
  const prisma = {
    patientAccount: { findFirst: jest.fn().mockResolvedValue(row) },
    clinicSettings: {
      findUnique: jest.fn().mockResolvedValue({ patientPortalEnabled: portalEnabled }),
    },
  };
  const cacheStore = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (k: string) => cacheStore.get(k) ?? null),
    set: jest.fn(async (k: string, v: unknown) => void cacheStore.set(k, v)),
  };
  const patient = new PatientContext();
  const guard = new PortalJwtGuard(jwt, config, prisma as never, patient, cache as never);
  const tokens = new PortalTokenService(jwt, config, prisma as never);
  return { guard, patient, tokens, prisma, cache };
}

function ctx(authorization?: string) {
  const request: Record<string, unknown> = { headers: { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('PortalJwtGuard and audience separation', () => {
  it('accepts a portal token, sets PatientContext and request.patient', async () => {
    const { guard, tokens, patient } = setup();
    const { context, request } = ctx(`Bearer ${tokens.signAccess(account)}`);
    // The middleware opens the request frame; the guard then fills it.
    await new Promise<void>((resolve, reject) =>
      patient.runWithFrame(() => {
        guard
          .canActivate(context)
          .then((ok) => {
            expect(ok).toBe(true);
            expect(patient.get()).toEqual({
              accountId: 'acc-1',
              patientId: 'pat-1',
              clinicId: 'clinic-1',
              locale: 'fr',
            });
            resolve();
          })
          .catch(reject);
      }),
    );
    expect(request.patient).toEqual({
      accountId: 'acc-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      locale: 'fr',
    });
  });

  it('rejects a staff token (no riaya-portal audience)', async () => {
    const { guard } = setup();
    const staff = jwt.sign(
      { sub: 'user-1', email: 'a@b.c', clinic_id: 'clinic-1' },
      { secret: 'test-access-secret-change-me-32chars' },
    );
    await expect(guard.canActivate(ctx(`Bearer ${staff}`).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a portal-audience token whose typ is not patient', async () => {
    const { guard } = setup();
    const bad = jwt.sign(
      { typ: 'staff', clinic_id: 'clinic-1', patient_id: 'pat-1' },
      {
        secret: 'test-access-secret-change-me-32chars',
        audience: 'riaya-portal',
        subject: 'acc-1',
      },
    );
    await expect(guard.canActivate(ctx(`Bearer ${bad}`).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token, a missing header and a token signed with another secret', async () => {
    const { guard } = setup();
    const claims = { typ: 'patient', clinic_id: 'clinic-1', patient_id: 'pat-1' };
    const expired = jwt.sign(claims, {
      secret: 'test-access-secret-change-me-32chars',
      audience: 'riaya-portal',
      subject: 'acc-1',
      expiresIn: -10,
    });
    const forged = jwt.sign(claims, {
      secret: 'another-secret-another-secret-123456',
      audience: 'riaya-portal',
      subject: 'acc-1',
    });
    for (const header of [`Bearer ${expired}`, `Bearer ${forged}`, undefined]) {
      await expect(guard.canActivate(ctx(header).context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('rejects when the account is disabled, missing or its patient is archived', async () => {
    for (const row of [
      null,
      { ...account, isActive: false },
      { ...account, patient: { status: 'ARCHIVED', clinicId: 'clinic-1' } },
    ]) {
      const { guard, tokens } = setup(row);
      await expect(
        guard.canActivate(ctx(`Bearer ${tokens.signAccess(account)}`).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('answers 403 PORTAL_DISABLED when the clinic switched the portal off, and caches the flag for 60 s', async () => {
    const { guard, tokens, prisma, cache } = setup(account, false);
    const header = `Bearer ${tokens.signAccess(account)}`;
    for (let i = 0; i < 2; i++) {
      await expect(guard.canActivate(ctx(header).context)).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ code: 'PORTAL_DISABLED' }),
      });
    }
    expect(prisma.clinicSettings.findUnique).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('portal:enabled:clinic-1', false, 60);
  });

  it('staff JwtStrategy rejects a token whose aud is riaya-portal, before any lookup', async () => {
    const users = { findById: jest.fn() };
    const strategy = new JwtStrategy(config, users as never, {} as never, {} as never);
    await expect(
      strategy.validate({ sub: 'acc-1', email: '', aud: 'riaya-portal' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      strategy.validate({ sub: 'acc-1', email: '', aud: ['x', 'riaya-portal'] }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findById).not.toHaveBeenCalled();
  });
});
