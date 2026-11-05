import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * TEST-073 → AC-001, TEST-074 → AC-002, TEST-075 → AC-003, TEST-076 → AC-004,
 * TEST-078 → AC-006, TEST-079 → AC-007, TEST-081 → AC-009.
 *
 * AC-005 and AC-008 are covered by tenant-scope.spec.ts and
 * audit.service.spec.ts.
 */

const PASSWORD = 'StrictTenantAdmin123!';

function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

describe('Strict tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: { sendPasswordReset: jest.Mock; sendInvitation: jest.Mock };

  let adminA: { email: string; token: string; userId: string };
  let adminB: { email: string; token: string; userId: string };
  let clinicA: string;
  let orgA: string;
  let clinicB: string;
  let orgB: string;

  async function register(email: string, orgName: string, clinicName: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: 'Tenant',
        lastName: 'Admin',
        organizationName: orgName,
        clinicName,
      })
      .expect(201);
    const clinicId = res.body.clinic.id as string;
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new Error('clinic missing');
    return { userId: res.body.user.id as string, clinicId, orgId: clinic.organizationId };
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-change-me-32chars';
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendInvitation: jest.fn().mockResolvedValue(undefined),
    };

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
    prisma = app.get(PrismaService);

    const a = await register('strict.a@riaya.local', 'Strict Org A', 'Strict Clinic A');
    const b = await register('strict.b@riaya.local', 'Strict Org B', 'Strict Clinic B');
    clinicA = a.clinicId;
    orgA = a.orgId;
    clinicB = b.clinicId;
    orgB = b.orgId;

    adminA = {
      email: 'strict.a@riaya.local',
      token: await login('strict.a@riaya.local'),
      userId: a.userId,
    };
    adminB = {
      email: 'strict.b@riaya.local',
      token: await login('strict.b@riaya.local'),
      userId: b.userId,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-001: the tenant scope comes from the verified token’s clinic claim', async () => {
    const payload = claims(adminA.token);
    expect(payload.clinic_id).toBe(clinicA);
    expect(payload.org_id).toBe(orgA);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminA.token}`)
      .expect(200);

    expect(me.body.role).toBe('SUPER_ADMIN');
    expect(me.body.email).toBe(adminA.email);
  });

  it('AC-002: a forged tenant id in the body is rejected and query/header ids are ignored', async () => {
    // The DTO does not declare organizationId, so the whitelist rejects it.
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminA.token}`)
      .send({
        organizationName: 'Forged Org',
        clinicName: 'Forged Clinic',
        organizationId: orgB,
        clinicId: clinicB,
      })
      .expect(400);

    // A query/header clinic id cannot widen the scope of the list endpoint.
    const res = await request(app.getHttpServer())
      .get('/api/invitations')
      .query({ clinicId: clinicB, organizationId: orgB })
      .set('Authorization', `Bearer ${adminA.token}`)
      .set('x-clinic-id', clinicB)
      .set('x-organization-id', orgB)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('AC-003: a clinic-scoped list returns only the caller’s rows', async () => {
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${adminA.token}`)
      .send({ email: 'invitee.a@riaya.local', clinicId: clinicA, role: 'DOCTOR' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${adminB.token}`)
      .send({ email: 'invitee.b@riaya.local', clinicId: clinicB, role: 'DOCTOR' })
      .expect(201);

    const aList = await request(app.getHttpServer())
      .get('/api/invitations')
      .set('Authorization', `Bearer ${adminA.token}`)
      .expect(200);

    const emails = aList.body.map((row: { email: string }) => row.email);
    expect(emails).toContain('invitee.a@riaya.local');
    expect(emails).not.toContain('invitee.b@riaya.local');
  });

  it('AC-004: a foreign membership is not found, not forbidden', async () => {
    const foreignMembership = await prisma.userMembership.findFirst({
      where: { userId: adminB.userId, clinicId: clinicB },
    });
    if (!foreignMembership) throw new Error('membership missing');

    const res = await request(app.getHttpServer())
      .patch(`/api/memberships/${foreignMembership.id}/suspend`)
      .set('Authorization', `Bearer ${adminA.token}`)
      .expect(404);

    expect(res.body.code).toBe('MEMBERSHIP_NOT_FOUND');

    const stillActive = await prisma.userMembership.findUnique({
      where: { id: foreignMembership.id },
    });
    expect(stillActive?.status).toBe('ACTIVE');
  });

  it('AC-006: a suspended membership stops working before its token expires', async () => {
    const c = await register('strict.c@riaya.local', 'Strict Org C', 'Strict Clinic C');
    const tokenC = await login('strict.c@riaya.local');
    const membership = await prisma.userMembership.findFirst({
      where: { userId: c.userId, clinicId: c.clinicId },
    });
    if (!membership) throw new Error('membership missing');
    await prisma.userMembership.update({
      where: { id: membership.id },
      data: { status: 'SUSPENDED' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(401);
    expect(res.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
  });

  it('AC-007: switching to a foreign clinic is refused', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${adminA.token}`)
      .send({ clinicId: clinicB })
      .expect(403);

    expect(res.body.code).toBe('NO_MEMBERSHIP');
  });

  it('AC-009: a refresh after a switch keeps the selected clinic', async () => {
    const second = await prisma.clinic.create({
      data: {
        organizationId: orgA,
        name: 'Strict Clinic A2',
        timezone: 'UTC',
        currency: 'USD',
      },
    });
    await prisma.userMembership.create({
      data: {
        userId: adminA.userId,
        organizationId: orgA,
        clinicId: second.id,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: adminA.email, password: PASSWORD })
      .expect(201);

    const switched = await agent
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ clinicId: second.id })
      .expect(201);

    expect(claims(switched.body.accessToken).clinic_id).toBe(second.id);

    const refreshed = await agent.post('/api/auth/refresh').expect(201);
    expect(claims(refreshed.body.accessToken).clinic_id).toBe(second.id);
  });
});
