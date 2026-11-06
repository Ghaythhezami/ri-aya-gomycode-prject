import * as argon2 from 'argon2';
import { RbacService } from '../rbac/rbac.service';
import { MembersService } from './members.service';
import { OnboardingService } from './onboarding.service';
import { TenancyService } from './tenancy.service';

const scopeOf = (role: string, over: Record<string, unknown> = {}) => ({
  userId: 'me',
  organizationId: 'org1',
  clinicId: 'c1',
  membershipId: 'm-me',
  role,
  roleId: null,
  ...over,
});

function fakePrisma(extra: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    clinic: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1' || where.id === 'c2'
          ? { id: where.id, organizationId: 'org1', name: 'Clinic' }
          : null,
      ),
    },
    clinicRole: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    clinicSettings: { findUnique: jest.fn(async () => ({ defaultLanguage: 'en' })) },
    invitation: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'i1',
        expiresAt: new Date(),
        ...data,
      })),
      findUnique: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    ...extra,
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return prisma;
}

describe('invite guard rails', () => {
  const build = () => {
    const prisma = fakePrisma();
    const rbac = new RbacService(prisma as never);
    const service = new OnboardingService(prisma as never, { record: jest.fn() } as never, rbac);
    return { service, prisma };
  };
  const invite = (
    service: OnboardingService,
    scope: ReturnType<typeof scopeOf>,
    over: Record<string, unknown> = {},
  ) =>
    service.invite({
      email: 'New@Example.com',
      clinicId: 'c1',
      scope: scope as never,
      invitedById: 'me',
      role: 'DOCTOR' as never,
      ...over,
    });

  it('H1: only a super admin can invite a SUPER_ADMIN (legacy role and roleKey)', async () => {
    const { service } = build();
    const admin = scopeOf('CLINIC_ADMIN');
    await expect(invite(service, admin, { role: 'SUPER_ADMIN' })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      invite(service, admin, { role: undefined, roleKey: 'SUPER_ADMIN' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invite(service, scopeOf('SUPER_ADMIN'), { role: 'SUPER_ADMIN' }),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
  });

  it('H1: the legacy role path checks capabilities and base role rank too', async () => {
    const { service } = build();
    await expect(
      invite(service, scopeOf('RECEPTIONIST'), { role: 'CLINIC_ADMIN' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invite(service, scopeOf('RECEPTIONIST'), { role: 'DOCTOR' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invite(service, scopeOf('CLINIC_ADMIN'), { role: 'DOCTOR' }),
    ).resolves.toBeTruthy();
  });

  it('M3: a non-super-admin can only invite into the clinic of their own scope', async () => {
    const { service } = build();
    await expect(
      invite(service, scopeOf('CLINIC_ADMIN'), { clinicId: 'c2' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(invite(service, scopeOf('SUPER_ADMIN'), { clinicId: 'c2' })).resolves.toBeTruthy();
  });

  it('M6: pending invitations carry roleKey and a localized roleName', async () => {
    const { service, prisma } = build();
    (prisma.clinicRole as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { id: 'r1', key: 'nurse', name: { en: 'Nurse' }, isSystem: false },
    ]);
    (prisma.invitation as { findMany: jest.Mock }).findMany.mockResolvedValue([
      { id: 'i1', email: 'a@b.c', role: 'RECEPTIONIST', roleId: 'r1' },
      { id: 'i2', email: 'd@e.f', role: 'DOCTOR', roleId: null },
    ]);
    const list = await service.listPendingInvitations(scopeOf('CLINIC_ADMIN') as never);
    expect(list[0]).toMatchObject({ roleKey: 'nurse', roleName: 'Nurse' });
    expect(list[1]).toMatchObject({ roleKey: 'DOCTOR', roleName: 'Doctor' });
  });
});

describe('acceptInvitation', () => {
  const PASSWORD = 'Str0ng!Passw0rd';
  let hash: string;
  beforeAll(async () => {
    hash = await argon2.hash('OldPassw0rd!x');
  });

  function build(over: { existing?: boolean; membership?: unknown; claimed?: number } = {}) {
    const invitation = {
      id: 'i1',
      email: 'x@y.z',
      organizationId: 'org1',
      clinicId: 'c1',
      role: 'DOCTOR',
      roleId: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const user = { id: 'u9', email: 'x@y.z', passwordHash: hash };
    const prisma = fakePrisma({
      user: {
        findUnique: jest.fn(async () => (over.existing ? user : null)),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'new',
          ...data,
        })),
        update: jest.fn(),
      },
      userMembership: {
        findFirst: jest.fn(async () => over.membership ?? null),
        upsert: jest.fn(async () => ({})),
      },
    });
    (prisma.invitation as Record<string, jest.Mock>).findUnique.mockResolvedValue(invitation);
    (prisma.invitation as Record<string, jest.Mock>).updateMany.mockResolvedValue({
      count: over.claimed ?? 1,
    });
    const service = new OnboardingService(prisma as never, { record: jest.fn() } as never);
    return { service, prisma };
  }

  it('M2: an existing account must prove itself and keeps its password', async () => {
    const { service, prisma } = build({ existing: true });
    await expect(
      service.acceptInvitation({ token: 't', password: PASSWORD }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ACCOUNT_EXISTS_LOGIN_REQUIRED' } });
    await expect(
      service.acceptInvitation({ token: 't', password: PASSWORD, currentPassword: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.acceptInvitation({
        token: 't',
        password: PASSWORD,
        currentPassword: 'OldPassw0rd!x',
      }),
    ).resolves.toMatchObject({ userId: 'u9', role: 'DOCTOR' });
    expect((prisma.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('M2: claims the invitation atomically and aborts when already claimed', async () => {
    const { service, prisma } = build({ claimed: 0 });
    await expect(
      service.acceptInvitation({ token: 't', password: PASSWORD }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INVALID_INVITATION' } });
    expect((prisma.invitation as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'i1', consumedAt: null }),
      }),
    );
    expect((prisma.user as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('M2: a new invitee gets an account with the chosen password', async () => {
    const { service, prisma } = build();
    await service.acceptInvitation({ token: 't', password: PASSWORD, firstName: 'A' });
    expect((prisma.user as { create: jest.Mock }).create).toHaveBeenCalled();
    expect((prisma.userMembership as { upsert: jest.Mock }).upsert).toHaveBeenCalled();
  });

  it('M2: never silently reactivates a suspended membership', async () => {
    const { service, prisma } = build({ existing: true, membership: { status: 'SUSPENDED' } });
    await expect(
      service.acceptInvitation({
        token: 't',
        password: PASSWORD,
        currentPassword: 'OldPassw0rd!x',
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'MEMBERSHIP_SUSPENDED' } });
    expect((prisma.userMembership as { upsert: jest.Mock }).upsert).not.toHaveBeenCalled();
  });
});

describe('suspendMembership', () => {
  function build(
    caller: string,
    target: Record<string, unknown>,
    others: Array<Record<string, unknown>> = [],
  ) {
    const calls: string[] = [];
    const prisma = fakePrisma({
      userMembership: {
        findFirst: jest.fn(async () => ({
          id: 'mt',
          userId: 'ut',
          clinicId: 'c1',
          organizationId: 'org1',
          roleId: null,
          status: 'ACTIVE',
          ...target,
        })),
        findMany: jest.fn(async () => others),
        count: jest.fn(async () => 2),
        update: jest.fn(async () => {
          calls.push('update');
        }),
      },
    });
    const rbac = new RbacService(prisma as never);
    const events = {
      emit: jest.fn(async () => {
        calls.push('emit');
      }),
    };
    const tenant = { get: () => scopeOf(caller), peek: () => scopeOf(caller) };
    const service = new TenancyService(prisma as never, tenant as never, rbac, events as never);
    return { service, calls, events };
  }

  it('M1: refuses to suspend someone with more capabilities than the caller', async () => {
    const { service } = build('CLINIC_ADMIN', { role: 'SUPER_ADMIN' });
    await expect(
      service.suspendMembership({ membershipId: 'mt', organizationWide: false }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('M1: refuses to suspend the last active member who can manage roles', async () => {
    const { service } = build('SUPER_ADMIN', { role: 'CLINIC_ADMIN' }, [
      { userId: 'ud', role: 'DOCTOR', roleId: null },
    ]);
    await expect(
      service.suspendMembership({ membershipId: 'mt', organizationWide: true }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'VALIDATION_FAILED' } });
  });

  it('emits membership.suspended after the status update', async () => {
    const { service, calls, events } = build('CLINIC_ADMIN', { role: 'DOCTOR' });
    await service.suspendMembership({ membershipId: 'mt', organizationWide: false });
    expect(calls).toEqual(['update', 'emit']);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'membership.suspended',
        clinicId: 'c1',
        payload: { userId: 'ut' },
      }),
    );
  });
});

describe('MembersService.list', () => {
  function build(role: string) {
    const prisma = fakePrisma({
      userMembership: {
        findMany: jest.fn(async () => [
          {
            id: 'm2',
            userId: 'u2',
            role: 'DOCTOR',
            roleId: null,
            status: 'ACTIVE',
            user: { email: 'z@x.y', firstName: 'Zed', lastName: 'Last' },
          },
          {
            id: 'm1',
            userId: 'me',
            role: 'CLINIC_ADMIN',
            roleId: null,
            status: 'ACTIVE',
            user: { email: 'a@x.y', firstName: 'Amy', lastName: 'First' },
          },
        ]),
      },
    });
    const rbac = new RbacService(prisma as never);
    return new MembersService(prisma as never, { get: () => scopeOf(role) } as never, rbac);
  }

  it('lists the clinic staff sorted by name with role labels and isSelf', async () => {
    const list = await build('CLINIC_ADMIN').list();
    expect(list.map((m) => m.name)).toEqual(['Amy First', 'Zed Last']);
    expect(list[0]).toMatchObject({
      membershipId: 'm1',
      userId: 'me',
      email: 'a@x.y',
      roleKey: 'CLINIC_ADMIN',
      roleName: 'Clinic admin',
      role: 'CLINIC_ADMIN',
      status: 'ACTIVE',
      isSelf: true,
    });
    expect(list[1].isSelf).toBe(false);
  });

  it('denies callers without manageStaff or inviteStaff', async () => {
    await expect(build('DOCTOR').list()).rejects.toMatchObject({ status: 403 });
  });
});
