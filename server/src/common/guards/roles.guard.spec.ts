import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** TEST-082/084/090 → AC-002, AC-003, AC-009. */

function context(user: unknown, handler: () => void) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

function handlerWith(roles?: string[]) {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler);
  return handler;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC-002: allows a listed role and rejects one outside the set', () => {
    const handler = handlerWith(['SUPER_ADMIN', 'CLINIC_ADMIN']);

    expect(guard.canActivate(context({ role: 'CLINIC_ADMIN' }, handler))).toBe(true);
    expect(() => guard.canActivate(context({ role: 'DOCTOR' }, handler))).toThrow(
      ForbiddenException,
    );
  });

  it('AC-009: denies a missing or unknown role', () => {
    const handler = handlerWith(['SUPER_ADMIN']);

    expect(() => guard.canActivate(context({ role: null }, handler))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ role: 'OWNER' }, handler))).toThrow(
      ForbiddenException,
    );
  });

  it('AC-003: a handler with no roles metadata is authenticated-any', () => {
    expect(guard.canActivate(context({ role: 'RECEPTIONIST' }, handlerWith()))).toBe(true);
  });
});
