import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CAPABILITY_KEY } from '../decorators/capability.decorator';

/** TEST-082/084/090 → AC-002, AC-003, AC-009; ADR 0004 capability checks. */

function context(user: unknown, handler: () => void) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

function handlerWith(meta: { roles?: string[]; capability?: string } = {}) {
  const handler = () => undefined;
  if (meta.roles) Reflect.defineMetadata(ROLES_KEY, meta.roles, handler);
  if (meta.capability) Reflect.defineMetadata(CAPABILITY_KEY, meta.capability, handler);
  return handler;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC-002: allows a listed role and rejects one outside the set', async () => {
    const handler = handlerWith({ roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'] });
    await expect(guard.canActivate(context({ role: 'CLINIC_ADMIN' }, handler))).resolves.toBe(true);
    await expect(guard.canActivate(context({ role: 'DOCTOR' }, handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('AC-009: denies a missing or unknown role', async () => {
    const handler = handlerWith({ roles: ['SUPER_ADMIN'] });
    await expect(guard.canActivate(context({ role: null }, handler))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context({ role: 'OWNER' }, handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('AC-003: a handler with no metadata is authenticated-any', async () => {
    await expect(guard.canActivate(context({ role: 'RECEPTIONIST' }, handlerWith()))).resolves.toBe(
      true,
    );
  });

  it('without a tenant scope a capability falls back to the default matrix', async () => {
    const handler = handlerWith({ capability: 'viewAnalytics' });
    await expect(guard.canActivate(context({ role: 'DOCTOR' }, handler))).resolves.toBe(true);
    await expect(guard.canActivate(context({ role: 'RECEPTIONIST' }, handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('with a tenant scope the clinic role decides (custom role grants and denies)', async () => {
    const rbac = { has: jest.fn(async (_s: unknown, c: string) => c === 'viewAnalytics') };
    const tenant = { peek: () => ({ clinicId: 'c1', userId: 'u1', role: 'RECEPTIONIST' }) };
    const scoped = new RolesGuard(new Reflector(), rbac as never, tenant as never);
    await expect(
      scoped.canActivate(
        context({ role: 'RECEPTIONIST' }, handlerWith({ capability: 'viewAnalytics' })),
      ),
    ).resolves.toBe(true);
    await expect(
      scoped.canActivate(
        context({ role: 'RECEPTIONIST' }, handlerWith({ capability: 'manageRoles' })),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
