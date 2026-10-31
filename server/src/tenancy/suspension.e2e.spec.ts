import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * AC-022, AC-023 — suspending a membership must revoke that clinic's access
 * immediately, even for a token that has not expired.
 */
const OWNER_PASSWORD = 'SuspendOwner123!';
const DOCTOR_PASSWORD = 'SuspendDoctor123!';

describe('Membership suspension (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clinicId: string;
  let doctorUserId: string;
  let doctorMembershipId: string;
  let doctorToken: string;

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

    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'suspend.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Suspend',
        lastName: 'Owner',
        organizationName: 'Suspend Org',
        clinicName: 'Suspend Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;

    const ownerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'suspend.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = ownerLogin.body.accessToken;

    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'suspend.doctor@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    const token = new URL(acceptUrl).searchParams.get('token') ?? '';

    const accepted = await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({ token, password: DOCTOR_PASSWORD })
      .expect(201);
    doctorUserId = accepted.body.userId;

    const doctorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'suspend.doctor@riaya.local', password: DOCTOR_PASSWORD })
      .expect(201);
    doctorToken = doctorLogin.body.accessToken;

    const membership = await app
      .get(PrismaService)
      .userMembership.findFirst({ where: { userId: doctorUserId, clinicId } });
    doctorMembershipId = membership?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-018 → AC-022
  it('AC-022: kills the suspended member’s existing token immediately', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/memberships/${doctorMembershipId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(401);

    expect(after.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
  });

  // TEST-019 → AC-023
  it('AC-023: gives a suspended member no usable scope on a fresh login', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'suspend.doctor@riaya.local', password: DOCTOR_PASSWORD })
      .expect(201);

    expect(login.body.scope).toBeNull();

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });

  // TEST-020 → AC-022 (FR-029)
  it('AC-022: refuses to suspend the organization’s last SUPER_ADMIN', async () => {
    const memberships = await request(app.getHttpServer())
      .get('/api/auth/memberships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const own = memberships.body.find((entry: { clinicId: string }) => entry.clinicId === clinicId);

    const res = await request(app.getHttpServer())
      .patch(`/api/memberships/${own.membershipId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    expect(res.body.code).toBe('LAST_SUPER_ADMIN');
  });
});
