import {
  CAPABILITIES,
  LOCKED_ADMIN_CAPABILITIES,
  defaultCapabilities,
  type Capability,
} from '@riaya/shared';
import { RbacService } from '../rbac/rbac.service';
import { MAX_CUSTOM_ROLES, RolesService, roleSlug } from './roles.service';

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'startsWith' in v) {
      return String(row[k]).startsWith((v as { startsWith: string }).startsWith);
    }
    if (v && typeof v === 'object' && 'not' in v) return row[k] !== (v as { not: unknown }).not;
    if (v && typeof v === 'object') return true; // date windows are not modelled here
    return row[k] === v;
  });
}

function table(rows: Row[], idPrefix: string) {
  let n = 0;
  return {
    rows,
    findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.filter((r) => matches(r, where)),
    ),
    findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      ((found) => (found ? { ...found } : null))(rows.find((r) => matches(r, where))),
    ),
    count: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => matches(r, where)).length,
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${idPrefix}${++n}`, createdAt: new Date(), ...data } as Row;
      rows.push(row);
      return row;
    }),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id) as Row;
        Object.assign(row, data);
        return row;
      },
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      rows.splice(
        rows.findIndex((r) => r.id === where.id),
        1,
      );
    }),
  };
}

function setup(
  caller: { role: string; roleId?: string; userId?: string } = { role: 'CLINIC_ADMIN' },
  callerCaps?: Capability[],
) {
  const clinicRole = table([], 'role-');
  const userMembership = table([], 'mem-');
  const invitation = table([], 'inv-');
  const prisma: Record<string, unknown> = {
    clinicRole,
    userMembership,
    invitation,
    clinicSettings: { findUnique: jest.fn(async () => ({ defaultLanguage: 'fr' })) },
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  const audit = { record: jest.fn(async () => undefined) };
  const caps =
    callerCaps ??
    (caller.role === 'SUPER_ADMIN' ? [...CAPABILITIES] : defaultCapabilities(caller.role));
  const rbac = new RbacService(prisma as never);
  const realCapabilities = rbac.capabilitiesFor.bind(rbac);
  const callerId = caller.userId ?? 'me';
  const capabilitiesFor = jest
    .spyOn(rbac, 'capabilitiesFor')
    .mockImplementation(async (s, opts) =>
      s.userId === callerId ? caps : realCapabilities(s, opts),
    );
  jest.spyOn(rbac, 'invalidate').mockResolvedValue(undefined);
  const events = { emit: jest.fn(async (_event: unknown) => undefined) };
  const scope = {
    userId: caller.userId ?? 'me',
    organizationId: 'org1',
    clinicId: 'c1',
    membershipId: 'm-me',
    role: caller.role,
    roleId: caller.roleId ?? null,
  };
  const service = new RolesService(
    prisma as never,
    { get: () => scope } as never,
    audit as never,
    rbac,
    events as never,
  );
  return { service, clinicRole, userMembership, invitation, audit, rbac, events, capabilitiesFor };
}

const newRole = (over: Record<string, unknown> = {}) =>
  ({
    name: { en: 'Nurse', fr: 'Infirmier' },
    baseRole: 'RECEPTIONIST',
    capabilities: ['viewPatients', 'viewChat'],
    ...over,
  }) as never;

describe('roleSlug', () => {
  it('uses the English name, strips accents and falls back to "role"', () => {
    expect(roleSlug({ en: 'Head Nurse!', fr: 'x' })).toBe('head-nurse');
    expect(roleSlug({ fr: 'Médecin chef' })).toBe('medecin-chef');
    expect(roleSlug({ ar: 'ممرض' })).toBe('role');
  });
});

describe('RolesService', () => {
  it('lists the four system roles with defaults, member counts and localized names', async () => {
    const { service, userMembership } = setup();
    userMembership.rows.push(
      { id: 'a', clinicId: 'c1', role: 'DOCTOR', roleId: null },
      { id: 'b', clinicId: 'c1', role: 'DOCTOR', roleId: null },
    );
    const matrix = await service.matrix('ar');
    expect(matrix.capabilities).toHaveLength(CAPABILITIES.length);
    expect(matrix.roles.map((r) => r.key)).toEqual([
      'SUPER_ADMIN',
      'CLINIC_ADMIN',
      'DOCTOR',
      'RECEPTIONIST',
    ]);
    const doctor = matrix.roles.find((r) => r.key === 'DOCTOR');
    expect(doctor).toMatchObject({ memberCount: 2, editable: true, isSystem: true, id: null });
    expect(doctor?.displayName).toBe('طبيب');
    expect(matrix.roles[0]).toMatchObject({ editable: false, capabilities: [...CAPABILITIES] });
  });

  it('creates a custom role with a unique slug, audit and cache invalidation', async () => {
    const { service, audit, rbac } = setup();
    const first = await service.create(newRole(), 'en');
    const second = await service.create(newRole(), 'en');
    expect(first.key).toBe('nurse');
    expect(second.key).toBe('nurse-2');
    expect(first).toMatchObject({
      isSystem: false,
      baseRole: 'RECEPTIONIST',
      displayName: 'Nurse',
    });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'clinic_role', action: 'create' }),
    );
    expect(rbac.invalidate).toHaveBeenCalledWith('c1');
  });

  it('rejects an empty name, a SUPER_ADMIN base and unknown capabilities with 422', async () => {
    const { service } = setup();
    await expect(service.create(newRole({ name: { en: '  ' } }), null)).rejects.toMatchObject({
      status: 422,
    });
    await expect(service.create(newRole({ baseRole: 'SUPER_ADMIN' }), null)).rejects.toMatchObject({
      status: 422,
    });
    await expect(service.create(newRole({ capabilities: ['nope'] }), null)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('enforces the custom role limit', async () => {
    const { service, clinicRole } = setup();
    for (let i = 0; i < MAX_CUSTOM_ROLES; i += 1) {
      clinicRole.rows.push({
        id: `x${i}`,
        clinicId: 'c1',
        key: `r${i}`,
        isSystem: false,
        capabilities: [],
      });
    }
    await expect(service.create(newRole(), null)).rejects.toMatchObject({ status: 422 });
  });

  it('blocks escalation: a caller cannot grant a capability they lack', async () => {
    const { service, clinicRole } = setup({ role: 'RECEPTIONIST', roleId: 'r-mgr' }, [
      'manageRoles',
      'viewPatients',
    ]);
    await expect(
      service.create(newRole({ capabilities: ['viewPatients', 'manageSettings'] }), null),
    ).rejects.toMatchObject({ status: 403 });
    expect(clinicRole.create).not.toHaveBeenCalled();

    // Editing: only the newly added capabilities are checked.
    clinicRole.rows.push({
      id: 'r1',
      clinicId: 'c1',
      key: 'ops',
      isSystem: false,
      baseRole: 'RECEPTIONIST',
      name: { en: 'Ops' },
      capabilities: ['viewPatients', 'manageSettings'],
    });
    await expect(
      service.update(
        'ops',
        { capabilities: ['viewPatients', 'manageSettings', 'viewAuditLog'] },
        null,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.update('ops', { capabilities: ['viewPatients', 'manageSettings'] }, null),
    ).resolves.toMatchObject({ key: 'ops' });
  });

  it('makes SUPER_ADMIN read-only', async () => {
    const { service } = setup({ role: 'SUPER_ADMIN' });
    await expect(service.update('SUPER_ADMIN', { capabilities: [] }, null)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.remove('SUPER_ADMIN')).rejects.toMatchObject({ status: 403 });
  });

  it('keeps the locked capabilities on CLINIC_ADMIN', async () => {
    const { service } = setup();
    const without = defaultCapabilities('CLINIC_ADMIN').filter(
      (c) => !LOCKED_ADMIN_CAPABILITIES.includes(c),
    );
    await expect(
      service.update('CLINIC_ADMIN', { capabilities: without }, null),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'VALIDATION_FAILED' },
    });
  });

  it('customises a system role by upserting a row, and resets it by deleting the row', async () => {
    const { service, clinicRole, userMembership } = setup();
    const dto = await service.update(
      'DOCTOR',
      { capabilities: ['viewOverview', 'viewChat'] },
      'en',
    );
    expect(dto).toMatchObject({
      key: 'DOCTOR',
      isSystem: true,
      capabilities: ['viewOverview', 'viewChat'],
    });
    expect(clinicRole.rows).toHaveLength(1);
    expect(clinicRole.rows[0]).toMatchObject({ isSystem: true, baseRole: 'DOCTOR' });

    userMembership.rows.push({
      id: 'm1',
      clinicId: 'c1',
      role: 'DOCTOR',
      roleId: clinicRole.rows[0].id,
    });
    await service.remove('DOCTOR');
    expect(clinicRole.rows).toHaveLength(0);
    expect(userMembership.rows[0].roleId).toBeNull();
    const reset = (await service.matrix(null)).roles.find((r) => r.key === 'DOCTOR');
    expect(reset?.capabilities).toEqual(defaultCapabilities('DOCTOR'));
  });

  it('refuses to delete a custom role in use (409) and deletes an unused one', async () => {
    const { service, clinicRole, userMembership } = setup();
    await service.create(newRole(), null);
    const id = clinicRole.rows[0].id;
    userMembership.rows.push({ id: 'm1', clinicId: 'c1', role: 'RECEPTIONIST', roleId: id });
    await expect(service.remove('nurse')).rejects.toMatchObject({ status: 409 });
    userMembership.rows.length = 0;
    await expect(service.remove('nurse')).resolves.toEqual({ success: true });
    await expect(service.remove('nurse')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to delete a role with a pending invitation', async () => {
    const { service, clinicRole, invitation } = setup();
    await service.create(newRole(), null);
    invitation.rows.push({
      id: 'i1',
      clinicId: 'c1',
      roleId: clinicRole.rows[0].id,
      consumedAt: null,
    });
    await expect(service.remove('nurse')).rejects.toMatchObject({ status: 409 });
  });

  describe('assign', () => {
    it('writes role = baseRole and roleId, audits, and invalidates', async () => {
      const { service, clinicRole, userMembership, audit, rbac } = setup();
      await service.create(newRole(), null);
      userMembership.rows.push({
        id: 'm1',
        userId: 'u2',
        clinicId: 'c1',
        organizationId: 'org1',
        role: 'DOCTOR',
        roleId: null,
      });
      const result = await service.assign('m1', { roleKey: 'nurse' });
      expect(result).toMatchObject({ role: 'RECEPTIONIST', roleId: clinicRole.rows[0].id });
      expect(userMembership.rows[0]).toMatchObject({
        role: 'RECEPTIONIST',
        roleId: clinicRole.rows[0].id,
      });
      expect(audit.record).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ entity: 'user_membership', entityId: 'm1' }),
      );
      expect(rbac.invalidate).toHaveBeenCalled();

      await service.assign('m1', { roleKey: 'DOCTOR' });
      expect(userMembership.rows[0]).toMatchObject({ role: 'DOCTOR', roleId: null });
    });

    it('returns 404 for a membership of another clinic', async () => {
      const { service, userMembership } = setup();
      userMembership.rows.push({
        id: 'm9',
        userId: 'u9',
        clinicId: 'other',
        organizationId: 'org1',
        role: 'DOCTOR',
      });
      await expect(service.assign('m9', { roleKey: 'DOCTOR' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('blocks changing your own role', async () => {
      const { service, userMembership } = setup();
      userMembership.rows.push({
        id: 'mine',
        userId: 'me',
        clinicId: 'c1',
        organizationId: 'org1',
        role: 'CLINIC_ADMIN',
      });
      await expect(service.assign('mine', { roleKey: 'DOCTOR' })).rejects.toMatchObject({
        status: 403,
      });
    });

    it('only a SUPER_ADMIN can assign or change SUPER_ADMIN', async () => {
      const admin = setup();
      admin.userMembership.rows.push(
        { id: 'a', userId: 'u2', clinicId: 'c1', organizationId: 'org1', role: 'DOCTOR' },
        { id: 'b', userId: 'u3', clinicId: 'c1', organizationId: 'org1', role: 'SUPER_ADMIN' },
      );
      await expect(admin.service.assign('a', { roleKey: 'SUPER_ADMIN' })).rejects.toMatchObject({
        status: 403,
      });
      await expect(admin.service.assign('b', { roleKey: 'DOCTOR' })).rejects.toMatchObject({
        status: 403,
      });

      const owner = setup({ role: 'SUPER_ADMIN' });
      owner.userMembership.rows.push({
        id: 'a',
        userId: 'u2',
        clinicId: 'c1',
        organizationId: 'org1',
        role: 'DOCTOR',
      });
      await expect(owner.service.assign('a', { roleKey: 'SUPER_ADMIN' })).resolves.toMatchObject({
        role: 'SUPER_ADMIN',
      });
    });

    it('blocks assigning a role whose capabilities the caller lacks', async () => {
      const { service, clinicRole, userMembership } = setup({ role: 'RECEPTIONIST' }, [
        'manageStaff',
        'viewPatients',
      ]);
      clinicRole.rows.push({
        id: 'r1',
        clinicId: 'c1',
        key: 'powerful',
        isSystem: false,
        baseRole: 'DOCTOR',
        capabilities: ['viewPatients', 'manageRoles'],
      });
      userMembership.rows.push({
        id: 'a',
        userId: 'u2',
        clinicId: 'c1',
        organizationId: 'org1',
        role: 'DOCTOR',
      });
      await expect(service.assign('a', { roleKey: 'powerful' })).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});

describe('RolesService security follow-up', () => {
  const member = (over: Record<string, unknown> = {}) => ({
    id: 'a',
    userId: 'u2',
    clinicId: 'c1',
    organizationId: 'org1',
    role: 'DOCTOR',
    roleId: null,
    status: 'ACTIVE',
    ...over,
  });

  it('H2: a custom role cannot carry a base role above the caller (create, update, assign)', async () => {
    // A receptionist-based role manager holding manageRoles and manageStaff.
    const caps: Capability[] = [
      ...defaultCapabilities('RECEPTIONIST'),
      'manageRoles',
      'manageStaff',
    ];
    const { service, clinicRole, userMembership } = setup({ role: 'RECEPTIONIST' }, caps);
    await expect(
      service.create(newRole({ baseRole: 'CLINIC_ADMIN', capabilities: ['viewChat'] }), null),
    ).rejects.toMatchObject({ status: 403 });
    // DOCTOR default capabilities (readClinicalNotes, viewAnalytics) are not held.
    await expect(
      service.create(newRole({ baseRole: 'DOCTOR', capabilities: ['viewChat'] }), null),
    ).rejects.toMatchObject({ status: 403 });

    clinicRole.rows.push({
      id: 'r1',
      clinicId: 'c1',
      key: 'ops',
      isSystem: false,
      baseRole: 'RECEPTIONIST',
      name: { en: 'Ops' },
      capabilities: ['viewChat'],
    });
    await expect(service.update('ops', { baseRole: 'CLINIC_ADMIN' }, null)).rejects.toMatchObject({
      status: 403,
    });
    clinicRole.rows.push({
      id: 'r2',
      clinicId: 'c1',
      key: 'boss',
      isSystem: false,
      baseRole: 'CLINIC_ADMIN',
      name: { en: 'Boss' },
      capabilities: ['viewChat'],
    });
    userMembership.rows.push(member());
    await expect(service.assign('a', { roleKey: 'boss' })).rejects.toMatchObject({ status: 403 });
  });

  it('H2: a clinic admin can still create DOCTOR and RECEPTIONIST based roles', async () => {
    const { service } = setup();
    await expect(service.create(newRole({ baseRole: 'DOCTOR' }), null)).resolves.toBeDefined();
    await expect(
      service.create(newRole({ name: { en: 'Desk' }, baseRole: 'RECEPTIONIST' }), null),
    ).resolves.toBeDefined();
  });

  it('M1: cannot change a member who holds capabilities the caller lacks', async () => {
    const { service, userMembership } = setup({ role: 'RECEPTIONIST' }, [
      'manageStaff',
      'viewPatients',
      ...defaultCapabilities('RECEPTIONIST'),
    ]);
    userMembership.rows.push(member({ role: 'CLINIC_ADMIN' }));
    await expect(service.assign('a', { roleKey: 'RECEPTIONIST' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('M1: refuses to demote the last active member who can manage roles (409)', async () => {
    const { service, userMembership } = setup({ role: 'SUPER_ADMIN' });
    userMembership.rows.push(member({ role: 'CLINIC_ADMIN' }));
    await expect(service.assign('a', { roleKey: 'DOCTOR' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'VALIDATION_FAILED' },
    });
    // With a second role manager the demotion goes through.
    userMembership.rows.push(member({ id: 'b', userId: 'u3', role: 'CLINIC_ADMIN' }));
    await expect(service.assign('a', { roleKey: 'DOCTOR' })).resolves.toMatchObject({
      role: 'DOCTOR',
    });
  });

  it('M5: write guards read the caller capabilities fresh', async () => {
    const { service, capabilitiesFor } = setup();
    await service.create(newRole(), null);
    const calls = capabilitiesFor.mock.calls.filter(([, opts]) => opts?.fresh);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('emits membership.role_changed after commit for an assignment', async () => {
    const { service, userMembership, events, audit } = setup();
    userMembership.rows.push(member());
    const order: string[] = [];
    audit.record.mockImplementation(async () => {
      order.push('audit');
    });
    events.emit.mockImplementation(async () => {
      order.push('event');
    });
    await service.assign('a', { roleKey: 'RECEPTIONIST' });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'membership.role_changed',
        clinicId: 'c1',
        payload: { userId: 'u2' },
      }),
    );
    expect(order).toEqual(['audit', 'event']);
  });

  it('emits one membership.role_changed per member when a role baseRole changes', async () => {
    const { service, clinicRole, userMembership, events } = setup();
    clinicRole.rows.push({
      id: 'r1',
      clinicId: 'c1',
      key: 'ops',
      isSystem: false,
      baseRole: 'RECEPTIONIST',
      name: { en: 'Ops' },
      capabilities: ['viewChat'],
    });
    userMembership.rows.push(
      member({ id: 'm1', userId: 'u1', role: 'RECEPTIONIST', roleId: 'r1' }),
      member({ id: 'm2', userId: 'u2', role: 'RECEPTIONIST', roleId: 'r1' }),
    );
    await service.update('ops', { baseRole: 'DOCTOR' }, null);
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(
      events.emit.mock.calls.map(([e]) => (e as { payload: { userId: string } }).payload.userId),
    ).toEqual(['u1', 'u2']);
  });
});
