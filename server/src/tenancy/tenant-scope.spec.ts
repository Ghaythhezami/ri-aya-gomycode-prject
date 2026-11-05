import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OnboardingService } from './onboarding.service';
import { TenancyService } from './tenancy.service';
import { TenantContext, clinicWhere, organizationWhere, type TenantScope } from './tenant-context';
import { UserRole } from '../users/user-role.enum';

/** TEST-077 → AC-005: one reusable scoped-query helper feeds the services. */

describe('Tenant scope helpers', () => {
  const scope: TenantScope = {
    userId: 'u1',
    organizationId: 'org-a',
    clinicId: 'clinic-a',
    role: UserRole.SUPER_ADMIN,
    membershipId: 'm1',
  };

  it('AC-005: clinicWhere narrows to organization and clinic; organizationWhere stays org-wide', () => {
    expect(clinicWhere(scope)).toEqual({ organizationId: 'org-a', clinicId: 'clinic-a' });
    expect(organizationWhere(scope)).toEqual({ organizationId: 'org-a' });
  });

  it('AC-005: TenancyService builds its filters from the request scope', () => {
    const prisma = new PrismaService();
    const tenant = new TenantContext();
    const service = new TenancyService(prisma, tenant);

    tenant.set(scope);
    expect(service.clinicFilter()).toEqual({ organizationId: 'org-a', clinicId: 'clinic-a' });
    expect(service.organizationFilter()).toEqual({ organizationId: 'org-a' });
  });

  it('AC-005: the invitation list is filtered by the shared helper', async () => {
    process.env.NODE_ENV = 'test';
    const prisma = new PrismaService();
    const tenant = new TenantContext();
    await prisma.onModuleInit();

    try {
      await prisma.invitation.create({
        data: {
          email: 'own@riaya.local',
          organizationId: 'org-a',
          clinicId: 'clinic-a',
          role: UserRole.DOCTOR,
          tokenHash: 'hash-a',
          expiresAt: new Date(Date.now() + 60_000),
          invitedById: 'u1',
        },
      });
      await prisma.invitation.create({
        data: {
          email: 'foreign@riaya.local',
          organizationId: 'org-b',
          clinicId: 'clinic-b',
          role: UserRole.DOCTOR,
          tokenHash: 'hash-b',
          expiresAt: new Date(Date.now() + 60_000),
          invitedById: 'u2',
        },
      });

      const audit = new AuditService(prisma, tenant);
      const onboarding = new OnboardingService(prisma, audit);

      const own = await onboarding.listPendingInvitations(scope);
      expect(own.map((row) => row.email)).toEqual(['own@riaya.local']);
    } finally {
      await prisma.onModuleDestroy();
    }
  });
});
