import { canonicalName, normalizePhone, ProfileService } from './profile.service';
import { OnboardingStateService } from './onboarding-state.service';

describe('canonicalName', () => {
  it('uses the clinic default language, else the first filled one', () => {
    expect(canonicalName({ en: 'Sam', fr: 'Samuel' }, 'fr')).toBe('Samuel');
    expect(canonicalName({ ar: 'سامي', fr: 'Samuel' }, 'en')).toBe('Samuel');
    expect(canonicalName({ ar: 'سامي' }, 'en')).toBe('سامي');
    expect(canonicalName({}, 'en', 'keep')).toBe('keep');
  });
});

describe('normalizePhone', () => {
  it('accepts E.164-ish values and strips separators', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
    expect(normalizePhone('12ab')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
  });
});

function profileSetup(user: Record<string, unknown>, defaultLanguage = 'fr') {
  const state = { ...user };
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: jest.fn(async () => ({ ...state })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return { ...state };
      }),
    },
    clinicSettings: { findUnique: jest.fn(async () => ({ defaultLanguage })) },
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  const audit = { record: jest.fn(async () => undefined) };
  const rbac = {
    describe: jest.fn(async () => ({
      capabilities: ['viewOverview'],
      roleKey: 'DOCTOR',
      roleName: { en: 'Doctor' },
      defaultLocale: defaultLanguage,
    })),
  };
  const cache = { del: jest.fn(async () => undefined) };
  const tenant = {
    get: () => ({ userId: 'u1', clinicId: 'c1', role: 'DOCTOR', membershipId: 'm1' }),
  };
  const service = new ProfileService(
    prisma as never,
    tenant as never,
    audit as never,
    rbac as never,
    cache as never,
  );
  return { service, prisma, audit, cache, state };
}

const baseUser = {
  id: 'u1',
  email: 'a@b.c',
  firstName: 'Ann',
  lastName: 'Lee',
  firstNameI18n: {},
  lastNameI18n: {},
  phone: null,
  jobTitle: null,
  preferredLocale: 'en',
  onboardingCompletedAt: null,
};

describe('ProfileService', () => {
  it('derives canonical names from the clinic default language and audits the update', async () => {
    const { service, audit, cache, state } = profileSetup(baseUser, 'fr');
    const dto = await service.update(
      {
        firstNameI18n: { en: 'Ann', fr: 'Anne' },
        lastNameI18n: { ar: 'لي' },
        phone: '+33 6 12 34 56 78',
      } as never,
      'en',
    );
    expect(state.firstName).toBe('Anne');
    expect(state.lastName).toBe('لي');
    expect(dto.phone).toBe('+33612345678');
    expect(dto.roleKey).toBe('DOCTOR');
    expect(dto.capabilities).toEqual(['viewOverview']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'user', action: 'update', entityId: 'u1' }),
    );
    expect(cache.del).toHaveBeenCalledWith('user:id:u1');
  });

  it('rejects an empty name map and a bad phone with 422', async () => {
    const { service } = profileSetup(baseUser);
    await expect(
      service.update({ firstNameI18n: { en: ' ' } } as never, null),
    ).rejects.toMatchObject({ status: 422 });
    await expect(service.update({ phone: 'abc' } as never, null)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('clears phone and job title with null and writes nothing for an empty patch', async () => {
    const { service, prisma } = profileSetup({
      ...baseUser,
      phone: '+33612345678',
      jobTitle: 'GP',
    });
    await service.update({ phone: null, jobTitle: null } as never, null);
    expect((prisma.user as { update: jest.Mock }).update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: null, jobTitle: null } }),
    );
    (prisma.user as { update: jest.Mock }).update.mockClear();
    await service.update({} as never, null);
    expect((prisma.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });
});

describe('OnboardingStateService', () => {
  function setup(opts: {
    admin: boolean;
    user?: Record<string, unknown>;
    clinic?: Record<string, unknown>;
    hours?: unknown;
    types?: number;
    doctors?: number;
    members?: number;
    invitations?: number;
  }) {
    const prisma: Record<string, unknown> = {
      user: {
        findUnique: jest.fn(async () => ({ ...baseUser, ...opts.user })),
        update: jest.fn(async () => undefined),
      },
      clinic: {
        findFirst: jest.fn(async () => ({
          nameI18n: {},
          address: null,
          onboardingCompletedAt: null,
          ...opts.clinic,
        })),
        update: jest.fn(async () => ({ id: 'c1' })),
      },
      clinicSettings: { findUnique: jest.fn(async () => ({ openingHours: opts.hours ?? [] })) },
      appointmentTypeDef: { count: jest.fn(async () => opts.types ?? 0) },
      doctor: { count: jest.fn(async () => opts.doctors ?? 0) },
      userMembership: { count: jest.fn(async () => opts.members ?? 0) },
      invitation: { count: jest.fn(async () => opts.invitations ?? 0) },
    };
    prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
    const rbac = { has: jest.fn(async () => opts.admin) };
    const audit = { record: jest.fn(async () => undefined) };
    const tenant = {
      get: () => ({ userId: 'u1', clinicId: 'c1', role: 'CLINIC_ADMIN', membershipId: 'm1' }),
    };
    const cache = { del: jest.fn(async () => undefined) };
    const service = new OnboardingStateService(
      prisma as never,
      tenant as never,
      audit as never,
      rbac as never,
      cache as never,
    );
    return { service, prisma, audit };
  }

  it('shows only the profile step to non-administrators', async () => {
    const { service } = setup({ admin: false, user: { phone: '+33612345678' } });
    expect(await service.state()).toEqual({
      completed: false,
      steps: [{ key: 'profile', done: true }],
    });
  });

  it('computes every clinic step for administrators', async () => {
    const empty = await setup({ admin: true }).service.state();
    expect(empty.steps.map((s) => s.key)).toEqual([
      'profile',
      'clinic',
      'hours',
      'appointmentTypes',
      'doctors',
      'team',
    ]);
    expect(empty.steps.every((s) => !s.done)).toBe(true);

    const full = await setup({
      admin: true,
      user: { jobTitle: 'Owner' },
      clinic: { address: '1 Rue X' },
      hours: [{ weekday: 1, open: 540, close: 1020, closed: false }],
      types: 3,
      doctors: 1,
      invitations: 1,
    }).service.state();
    expect(full.steps.every((s) => s.done)).toBe(true);
    expect(full.completed).toBe(false);
  });

  it('counts a localized clinic name and another active member', async () => {
    const { service } = setup({ admin: true, clinic: { nameI18n: { ar: 'عيادة' } }, members: 2 });
    const state = await service.state();
    expect(state.steps.find((s) => s.key === 'clinic')?.done).toBe(true);
    expect(state.steps.find((s) => s.key === 'team')?.done).toBe(true);
  });

  it('completes the clinic scope only with manageSettings', async () => {
    const denied = setup({ admin: false });
    await expect(denied.service.complete('clinic')).rejects.toMatchObject({ status: 403 });
    const ok = setup({ admin: true });
    await ok.service.complete('clinic');
    expect((ok.prisma.clinic as { update: jest.Mock }).update).toHaveBeenCalled();
    expect(ok.audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'clinic' }),
    );
  });

  it('completes the user scope for anyone', async () => {
    const { service, prisma } = setup({ admin: false });
    await service.complete('user');
    expect((prisma.user as { update: jest.Mock }).update).toHaveBeenCalled();
  });
});
