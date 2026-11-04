import { CAPABILITY_ROLES } from '@riaya/shared';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { UsersController } from '../users/users.controller';
import { TenancyController } from '../tenancy/tenancy.controller';

/** TEST-082 → AC-001, TEST-084 → AC-003, TEST-085 → AC-004. */

function rolesOf(target: object, method: string): string[] | undefined {
  const descriptor = (target as Record<string, unknown>)[method];
  if (typeof descriptor !== 'function') return undefined;
  return Reflect.getMetadata(ROLES_KEY, descriptor as object);
}

function context(user: unknown, handler: () => void) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

describe('Role metadata and the shared matrix', () => {
  it('AC-001: role-sensitive endpoints declare the shared matrix entry', () => {
    expect(rolesOf(UsersController.prototype, 'create')).toEqual([...CAPABILITY_ROLES.manageStaff]);
    expect(rolesOf(TenancyController.prototype, 'invite')).toEqual([
      ...CAPABILITY_ROLES.inviteStaff,
    ]);
    expect(rolesOf(TenancyController.prototype, 'suspend')).toEqual([
      ...CAPABILITY_ROLES.suspendMembership,
    ]);
  });

  it('AC-003: authenticated-any endpoints carry no role restriction', () => {
    expect(rolesOf(TenancyController.prototype, 'createOrganization')).toBeUndefined();
    expect(rolesOf(TenancyController.prototype, 'listInvitations')).toBeUndefined();
  });

  it('AC-004: enforcement reads the shared entry, not a private copy', () => {
    const guard = new RolesGuard(new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [...CAPABILITY_ROLES.viewAnalytics], handler);

    expect(guard.canActivate(context({ role: 'DOCTOR' }, handler))).toBe(true);
    expect(() => guard.canActivate(context({ role: 'RECEPTIONIST' }, handler))).toThrow();
  });
});
