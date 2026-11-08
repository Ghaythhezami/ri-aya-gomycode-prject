import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';
import { TenancyService } from './tenancy.service';
import { TenantContext } from './tenant-context';
import { UserRole } from '../users/user-role.enum';

/**
 * v2 role management: a successful change reaches the next token, the last
 * SUPER_ADMIN is protected, and every change is audited with before/after.
 */
const OWNER_PASSWORD = 'RoleMgmtOwner123!';
const INVITEE_PASSWORD = 'RoleMgmtStaff123!';

describe('Role management (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clinicId: string;
  let organizationId: string;
  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue({ status: 'SENT' }),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-change-me-32chars';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'role.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Role',
        lastName: 'Owner',
        organizationName: 'Role Org',
        clinicName: 'Role Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;
    organizationId = owner.body.organization.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'role.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function addMember(email: string, role = 'DOCTOR') {
    mail.sendInvitation.mockReset();
    mail.sendInvitation.mockResolvedValue({ status: 'SENT' });
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, clinicId, role })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    const token = new URL(acceptUrl).searchParams.get('token') ?? '';

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({
        token,
        password: INVITEE_PASSWORD,
        firstName: 'Role',
        lastName: 'Member',
      })
      .expect(201);

    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('invited member identity missing');
    const membership = await prisma.userMembership.findFirst({
      where: { userId: user.id, clinicId },
    });
    if (!membership) throw new Error('invited member membership missing');
    return { user, membership };
  }

  it('AC-058: a role change is reflected the next time a token is issued', async () => {
    const email = 'role.change@riaya.local';
    const { membership } = await addMember(email, 'DOCTOR');

    const before = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: INVITEE_PASSWORD })
      .expect(201);
    expect(before.body.user.role).toBe('DOCTOR');

    await request(app.getHttpServer())
      .patch(`/api/memberships/${membership.id}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'CLINIC_ADMIN' })
      .expect(200);

    const after = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: INVITEE_PASSWORD })
      .expect(201);
    expect(after.body.user.role).toBe('CLINIC_ADMIN');
    expect(after.body.scope.role).toBe('CLINIC_ADMIN');
    expect(after.body.scope.clinicId).toBe(clinicId);
  });

  it('AC-059: a change that would leave zero SUPER_ADMINs is refused and writes nothing', async () => {
    const prisma = app.get(PrismaService);
    const owner = await prisma.user.findUnique({ where: { email: 'role.owner@riaya.local' } });
    if (!owner) throw new Error('owner identity missing');
    const membership = await prisma.userMembership.findFirst({
      where: { userId: owner.id, clinicId, role: UserRole.SUPER_ADMIN },
    });
    if (!membership) throw new Error('owner membership missing');

    const tenancy = app.get(TenancyService);
    const tenant = app.get(TenantContext);
    let caught: unknown;

    // The service reads its tenant from the request frame; a direct call needs
    // an explicit frame so `organizationFilter()` can resolve the organization.
    await new Promise<void>((resolve) => {
      tenant.runWithFrame(() => {
        tenant.set({
          userId: owner.id,
          organizationId,
          clinicId,
          role: UserRole.SUPER_ADMIN,
          membershipId: membership.id,
        });
        tenancy
          .changeMembershipRole({
            membershipId: membership.id,
            role: UserRole.CLINIC_ADMIN,
            // A different actor passes the self-change guard, so the only
            // remaining protection is the last-SUPER_ADMIN invariant.
            actorUserId: 'another-actor',
            organizationWide: true,
          })
          .then(() => resolve())
          .catch((error) => {
            caught = error;
            resolve();
          });
      });
    });

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: 'LAST_SUPER_ADMIN',
    });

    const unchanged = await prisma.userMembership.findUnique({ where: { id: membership.id } });
    expect(unchanged?.role).toBe(UserRole.SUPER_ADMIN);
  });

  it('AC-060: a successful role change writes an audit row with the before/after role', async () => {
    const prisma = app.get(PrismaService);
    const { membership } = await addMember('role.audit@riaya.local', 'DOCTOR');

    await request(app.getHttpServer())
      .patch(`/api/memberships/${membership.id}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'CLINIC_ADMIN' })
      .expect(200);

    const entries = await prisma.auditLog.findMany({
      where: { entity: 'user_membership', entityId: membership.id },
      orderBy: { createdAt: 'desc' },
    });
    const entry = entries.find((item) => item.action === 'update');
    expect(entry).toBeDefined();
    const before = entry?.before as unknown as { role?: string };
    const after = entry?.after as unknown as { role?: string };
    expect(before.role).toBe('DOCTOR');
    expect(after.role).toBe('CLINIC_ADMIN');
  });
});
