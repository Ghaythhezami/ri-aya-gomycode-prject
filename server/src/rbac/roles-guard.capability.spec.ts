import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITIES, type Capability } from '@riaya/shared';
import { CAPABILITY_KEY } from '../common/decorators/capability.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RbacService } from './rbac.service';

function context(user: unknown, capability?: string) {
  const handler = () => undefined;
  if (capability) Reflect.defineMetadata(CAPABILITY_KEY, capability, handler);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

function build(rows: Array<{ id: string; key: string; capabilities: string[] }>) {
  const prisma = {
    clinicRole: {
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; key?: string } }) =>
          rows.find((r) => r.id === where.id || (where.key && r.key === where.key)) ?? null,
      ),
    },
  };
  const rbac = new RbacService(prisma as never);
  const scope = (role: string, roleId?: string) => ({
    clinicId: 'c1',
    userId: 'u1',
    organizationId: 'o1',
    membershipId: 'm1',
    role,
    roleId,
  });
  const guardFor = (s: ReturnType<typeof scope>) =>
    new RolesGuard(new Reflector(), rbac, { peek: () => s } as never);
  return { guardFor, scope };
}

describe('RolesGuard with capability metadata', () => {
  const { guardFor, scope } = build([
    { id: 'r-viewer', key: 'viewer', capabilities: ['viewPatients'] },
    { id: 'r-empty', key: 'empty', capabilities: [] },
  ]);

  it('lets a custom role pass for a capability it grants', async () => {
    const guard = guardFor(scope('RECEPTIONIST', 'r-viewer'));
    await expect(
      guard.canActivate(context({ role: 'RECEPTIONIST' }, 'viewPatients')),
    ).resolves.toBe(true);
  });

  it('denies a custom role a capability its base role would have had', async () => {
    const guard = guardFor(scope('RECEPTIONIST', 'r-viewer'));
    await expect(
      guard.canActivate(context({ role: 'RECEPTIONIST' }, 'manageAppointments')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPER_ADMIN passes every capability', async () => {
    const guard = guardFor(scope('SUPER_ADMIN'));
    for (const capability of CAPABILITIES) {
      await expect(guard.canActivate(context({ role: 'SUPER_ADMIN' }, capability))).resolves.toBe(
        true,
      );
    }
  });

  it('denies an unknown capability, even for a clinic admin', async () => {
    const guard = guardFor(scope('CLINIC_ADMIN'));
    await expect(
      guard.canActivate(context({ role: 'CLINIC_ADMIN' }, 'doEverything' as Capability)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a user without a role and allows a route without metadata', async () => {
    const guard = guardFor(scope('DOCTOR'));
    await expect(guard.canActivate(context({ role: null }, 'viewPatients'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(context({ role: 'DOCTOR' }))).resolves.toBe(true);
  });

  it('falls back to the default matrix without a tenant scope', async () => {
    const guard = new RolesGuard(new Reflector());
    await expect(guard.canActivate(context({ role: 'DOCTOR' }, 'readClinicalNotes'))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(context({ role: 'DOCTOR' }, 'manageRoles')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
