import { CAPABILITY_ROLES } from '@riaya/shared';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators/roles.decorator';
import { CAPABILITY_KEY } from './decorators/capability.decorator';
import { RolesGuard } from './guards/roles.guard';
import { UsersController } from '../users/users.controller';
import { TenancyController } from '../tenancy/tenancy.controller';

/** TEST-082 → AC-001, TEST-084 → AC-003, TEST-085 → AC-004. */

function meta(target: object, method: string, key: string): unknown {
  const descriptor = (target as Record<string, unknown>)[method];
  if (typeof descriptor !== 'function') return undefined;
  return Reflect.getMetadata(key, descriptor as object);
}
const capabilityOf = (target: object, method: string) => meta(target, method, CAPABILITY_KEY);
const rolesOf = (target: object, method: string) => meta(target, method, ROLES_KEY);

function context(user: unknown, handler: () => void) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

describe('Role metadata and the shared matrix', () => {
  it('AC-001: role-sensitive endpoints declare a capability of the shared matrix', () => {
    expect(capabilityOf(UsersController.prototype, 'create')).toBe('manageStaff');
    expect(capabilityOf(TenancyController.prototype, 'invite')).toBe('inviteStaff');
    expect(capabilityOf(TenancyController.prototype, 'suspend')).toBe('suspendMembership');
  });

  it('AC-003: authenticated-any endpoints carry no role restriction', () => {
    expect(rolesOf(TenancyController.prototype, 'createOrganization')).toBeUndefined();
    expect(capabilityOf(TenancyController.prototype, 'createOrganization')).toBeUndefined();
    // Security review M6: pending invitations (emails, roles) are staff-management data.
    expect(capabilityOf(TenancyController.prototype, 'listInvitations')).toBe('inviteStaff');
  });

  it('AC-004: enforcement reads the shared entry, not a private copy', async () => {
    const guard = new RolesGuard(new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [...CAPABILITY_ROLES.viewAnalytics], handler);

    await expect(guard.canActivate(context({ role: 'DOCTOR' }, handler))).resolves.toBe(true);
    await expect(guard.canActivate(context({ role: 'RECEPTIONIST' }, handler))).rejects.toThrow();
  });
});
