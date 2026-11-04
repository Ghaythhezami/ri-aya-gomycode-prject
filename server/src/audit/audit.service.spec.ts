import { PrismaService } from '../database/prisma.service';
import { TenantContext } from '../tenancy/tenant-context';
import { UserRole } from '../users/user-role.enum';
import { AuditService } from './audit.service';

/** TEST-080 → AC-008: audit attribution and reads follow the verified scope. */

describe('AuditService tenant scope', () => {
  const prisma = new PrismaService();
  const tenant = new TenantContext();
  const audit = new AuditService(prisma, tenant);

  const scopeA = {
    userId: 'u1',
    organizationId: 'org-a',
    clinicId: 'clinic-a',
    role: UserRole.SUPER_ADMIN,
    membershipId: 'm1',
  };
  const scopeB = {
    userId: 'u2',
    organizationId: 'org-b',
    clinicId: 'clinic-b',
    role: UserRole.SUPER_ADMIN,
    membershipId: 'm2',
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('AC-008: a write with no tenant ids is attributed to the verified scope', async () => {
    tenant.set(scopeA);

    await audit.record(prisma as never, {
      actorUserId: 'u1',
      action: 'create',
      entity: 'invitation',
      entityId: 'entity-a',
    });

    const [row] = await prisma.auditLog.findMany({ where: { entityId: 'entity-a' } });
    expect(row.organizationId).toBe('org-a');
    expect(row.clinicId).toBe('clinic-a');
  });

  it('AC-008: an audit read returns only entries inside the caller’s tenant', async () => {
    tenant.set(scopeB);
    await audit.record(prisma as never, {
      actorUserId: 'u2',
      action: 'create',
      entity: 'invitation',
      entityId: 'entity-b',
    });

    tenant.set(scopeA);
    await expect(audit.listForEntity('invitation', 'entity-b')).resolves.toHaveLength(0);
    await expect(audit.listForEntity('invitation', 'entity-a')).resolves.toHaveLength(1);
  });
});
