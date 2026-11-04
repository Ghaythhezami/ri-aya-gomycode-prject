import { PrismaService } from '../database/prisma.service';
import { UserRole } from '../users/user-role.enum';
import { TenantContext } from './tenant-context';
import { TenancyService } from './tenancy.service';

/** TEST-100 → AC-010: the membership view exposes the clinic's timezone. */

describe('Membership timezone', () => {
  const prisma = new PrismaService();
  const tenant = new TenantContext();
  const service = new TenancyService(prisma, tenant);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('AC-010: every membership reports the clinic timezone', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Timezone Org', slug: 'timezone-org' },
    });
    const clinic = await prisma.clinic.create({
      data: {
        organizationId: organization.id,
        name: 'Riyadh Clinic',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
      },
    });
    const user = await prisma.user.create({
      data: {
        email: 'timezone@riaya.local',
        passwordHash: 'hash',
        firstName: 'Time',
        lastName: 'Zone',
      },
    });
    await prisma.userMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        clinicId: clinic.id,
        role: UserRole.DOCTOR,
        status: 'ACTIVE',
      },
    });

    const memberships = await service.listMemberships(user.id);

    expect(memberships).toHaveLength(1);
    expect(memberships[0].clinicTimezone).toBe('Asia/Riyadh');
  });
});
