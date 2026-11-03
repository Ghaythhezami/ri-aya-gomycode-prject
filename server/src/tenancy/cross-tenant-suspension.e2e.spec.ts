import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * Cross-tenant membership suspension.
 *
 * AC-022 lets a clinic admin suspend a membership, but the clinic is resolved
 * from the caller's verified scope. A membership that belongs to another
 * organization must therefore be unreachable, even when the caller knows its id.
 * The admin is the strongest clinic-scoped role, so if this holds for them it
 * holds for every narrower role.
 */
const ADMIN_PASSWORD = 'CrossTenantAdmin123!';
const OUTSIDER_PASSWORD = 'CrossTenantOutsider123!';

describe('Cross-tenant membership suspension (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let foreignClinicId: string;
  let foreignOrgId: string;
  let foreignMembershipId: string;
  let peerMembershipId: string;
  let foreignUserId: string;
  let victimUserId: string;

  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
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

    const server = app.getHttpServer();

    // Organization A — the caller's own organization.
    await request(server)
      .post('/api/auth/register')
      .send({
        email: 'cross.tenant.admin@riaya.local',
        password: ADMIN_PASSWORD,
        firstName: 'Cross',
        lastName: 'Admin',
        organizationName: 'Cross Tenant Org A',
        clinicName: 'Cross Tenant Clinic A',
      })
      .expect(201);

    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: 'cross.tenant.admin@riaya.local', password: ADMIN_PASSWORD })
      .expect(201);
    adminToken = adminLogin.body.accessToken;

    // A second membership inside the same organization, so the caller is a
    // CLINIC_ADMIN who is clearly allowed to suspend someone at home.
    mail.sendInvitation.mockClear();
    await request(server)
      .post('/api/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'cross.tenant.peer@riaya.local',
        clinicId: adminLogin.body.scope.clinicId ?? adminLogin.body.clinic?.id,
        role: 'RECEPTIONIST',
      })
      .expect(201);

    const peerToken = new URL(
      mail.sendInvitation.mock.calls[0][0].acceptUrl as string,
    ).searchParams.get('token') as string;
    const peer = await request(server)
      .post('/api/auth/accept-invite')
      .send({ token: peerToken, password: 'CrossTenantPeer123!' })
      .expect(201);
    const peerUserId = peer.body.userId as string;

    const prisma = app.get(PrismaService);
    const adminMemberships = await request(server)
      .get('/api/auth/memberships')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const homeClinicId = adminMemberships.body[0].clinicId as string;
    peerMembershipId =
      (
        await prisma.userMembership.findFirst({
          where: { userId: peerUserId, clinicId: homeClinicId },
        })
      )?.id ?? '';

    // Organization B — a completely separate tenant.
    await request(server)
      .post('/api/auth/register')
      .send({
        email: 'cross.tenant.outsider@riaya.local',
        password: OUTSIDER_PASSWORD,
        firstName: 'Cross',
        lastName: 'Outsider',
        organizationName: 'Cross Tenant Org B',
        clinicName: 'Cross Tenant Clinic B',
      })
      .expect(201);

    const outsiderLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: 'cross.tenant.outsider@riaya.local', password: OUTSIDER_PASSWORD })
      .expect(201);

    const outsiderScope = outsiderLogin.body.scope;
    foreignClinicId = outsiderScope.clinicId as string;
    foreignOrgId = outsiderScope.organizationId as string;
    foreignUserId = outsiderScope.userId as string;

    // Invite a plain RECEPTIONIST into organization B. The registrar is
    // organization B's only SUPER_ADMIN, and LAST_SUPER_ADMIN would mask the
    // tenancy check if we targeted them instead.
    mail.sendInvitation.mockClear();
    const outsiderToken = outsiderLogin.body.accessToken as string;
    await request(server)
      .post('/api/invitations')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        email: 'cross.tenant.victim@riaya.local',
        clinicId: foreignClinicId,
        role: 'RECEPTIONIST',
      })
      .expect(201);

    const victimToken = new URL(
      mail.sendInvitation.mock.calls[0][0].acceptUrl as string,
    ).searchParams.get('token') as string;
    const victim = await request(server)
      .post('/api/auth/accept-invite')
      .send({ token: victimToken, password: 'CrossTenantVictim123!' })
      .expect(201);
    victimUserId = victim.body.userId as string;

    const outsiderMembership = await prisma.userMembership.findFirst({
      where: { userId: victimUserId, clinicId: foreignClinicId },
    });
    foreignMembershipId = outsiderMembership?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-022: a clinic admin cannot suspend a membership in another organization', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/memberships/${foreignMembershipId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEMBERSHIP_NOT_FOUND');

    // The foreign tenant must be untouched.
    const membership = await app
      .get(PrismaService)
      .userMembership.findUnique({ where: { id: foreignMembershipId } });
    expect(membership?.status).toBe('ACTIVE');

    // And the victim must still be able to work: the foreign tenant is intact.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cross.tenant.victim@riaya.local', password: 'CrossTenantVictim123!' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });

  it('AC-022: an unknown membership id is reported identically to a foreign one', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/memberships/00000000-0000-4000-8000-000000000000/suspend')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEMBERSHIP_NOT_FOUND');
  });

  it('AC-022: the same caller can still suspend a member of their own clinic', async () => {
    await request(app.getHttpServer())
      .patch(`/api/memberships/${peerMembershipId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const membership = await app
      .get(PrismaService)
      .userMembership.findUnique({ where: { id: peerMembershipId } });
    expect(membership?.status).toBe('SUSPENDED');
  });

  it('AC-022: the foreign organization and user are still present after the attempts', async () => {
    const prisma = app.get(PrismaService);
    const org = await prisma.organization.findUnique({ where: { id: foreignOrgId } });
    const user = await prisma.user.findUnique({ where: { id: foreignUserId } });
    expect(org).not.toBeNull();
    expect(user?.isActive).toBe(true);
  });
});
