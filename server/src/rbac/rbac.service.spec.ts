import { CAPABILITIES, defaultCapabilities } from '@riaya/shared';
import { RbacService } from './rbac.service';

function memoryCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

function setup(rows: Array<Record<string, unknown>> = []) {
  const findFirst = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return (
      rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  });
  const prisma = { clinicRole: { findFirst } };
  const cache = memoryCache();
  const rbac = new RbacService(prisma as never, cache as never);
  return { rbac, findFirst, cache, rows };
}

const scope = { clinicId: 'c1', userId: 'u1', role: 'DOCTOR' as const };

describe('RbacService', () => {
  it('gives SUPER_ADMIN every capability without touching the database', async () => {
    const { rbac, findFirst } = setup();
    const caps = await rbac.capabilitiesFor({ ...scope, role: 'SUPER_ADMIN' });
    expect(caps).toEqual([...CAPABILITIES]);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the default matrix when the clinic has no row', async () => {
    const { rbac } = setup();
    expect(await rbac.capabilitiesFor(scope)).toEqual(defaultCapabilities('DOCTOR'));
  });

  it('prefers the membership role row, then the customised system row, then defaults', async () => {
    const { rbac } = setup([
      {
        id: 'r-custom',
        clinicId: 'c1',
        key: 'nurse',
        isSystem: false,
        capabilities: ['viewPatients'],
      },
      {
        id: 'r-sys',
        clinicId: 'c1',
        key: 'DOCTOR',
        isSystem: true,
        capabilities: ['viewOverview', 'viewChat'],
      },
    ]);
    expect(await rbac.capabilitiesFor({ ...scope, roleId: 'r-custom' })).toEqual(['viewPatients']);
    expect(await rbac.capabilitiesFor(scope)).toEqual(['viewOverview', 'viewChat']);
    expect(await rbac.capabilitiesFor({ ...scope, role: 'RECEPTIONIST' })).toEqual(
      defaultCapabilities('RECEPTIONIST'),
    );
  });

  it('never reads a role row of another clinic', async () => {
    const { rbac } = setup([
      {
        id: 'r-x',
        clinicId: 'other',
        key: 'nurse',
        isSystem: false,
        capabilities: ['manageRoles'],
      },
    ]);
    const caps = await rbac.capabilitiesFor({ ...scope, roleId: 'r-x' });
    // The row is invisible, so the default matrix of the legacy role applies.
    expect(caps).toEqual(defaultCapabilities('DOCTOR'));
  });

  it('drops unknown capability strings (deny by default)', async () => {
    const { rbac } = setup([
      {
        id: 'r1',
        clinicId: 'c1',
        key: 'x',
        isSystem: false,
        capabilities: ['viewPatients', 'launchMissiles'],
      },
    ]);
    expect(await rbac.capabilitiesFor({ ...scope, roleId: 'r1' })).toEqual(['viewPatients']);
  });

  it('caches per clinic version and re-reads after invalidate()', async () => {
    const { rbac, findFirst, rows } = setup([
      { id: 'r1', clinicId: 'c1', key: 'x', isSystem: false, capabilities: ['viewPatients'] },
    ]);
    const s = { ...scope, roleId: 'r1' };
    await rbac.capabilitiesFor(s);
    await rbac.capabilitiesFor(s);
    expect(findFirst).toHaveBeenCalledTimes(1);

    (rows[0] as { capabilities: string[] }).capabilities = ['viewPatients', 'viewChat'];
    expect(await rbac.capabilitiesFor(s)).toEqual(['viewPatients']); // still cached
    await new Promise((r) => setTimeout(r, 2));
    await rbac.invalidate('c1');
    expect(await rbac.capabilitiesFor(s)).toEqual(['viewPatients', 'viewChat']);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('works without a clinic_roles delegate (in-memory test database)', async () => {
    const rbac = new RbacService({} as never);
    expect(await rbac.capabilitiesFor(scope)).toEqual(defaultCapabilities('DOCTOR'));
  });

  it('describe() returns the custom role key and localized name', async () => {
    const { rbac } = setup([
      {
        id: 'r1',
        clinicId: 'c1',
        key: 'nurse',
        name: { en: 'Nurse', fr: 'Infirmier' },
        isSystem: false,
        capabilities: ['viewPatients'],
      },
    ]);
    const info = await rbac.describe({ ...scope, roleId: 'r1' });
    expect(info.roleKey).toBe('nurse');
    expect(info.roleName).toEqual({ en: 'Nurse', fr: 'Infirmier' });
    expect(info.capabilities).toEqual(['viewPatients']);
  });

  it('fresh: true bypasses the cached set (write guards)', async () => {
    const { rbac, findFirst, rows } = setup([
      { id: 'r1', clinicId: 'c1', key: 'x', isSystem: false, capabilities: ['viewPatients'] },
    ]);
    const s = { ...scope, roleId: 'r1' };
    await rbac.capabilitiesFor(s);
    (rows[0] as { capabilities: string[] }).capabilities = ['viewChat'];
    expect(await rbac.capabilitiesFor(s)).toEqual(['viewPatients']);
    expect(await rbac.capabilitiesFor(s, { fresh: true })).toEqual(['viewChat']);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
