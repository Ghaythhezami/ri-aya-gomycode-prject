import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { MAIL_SERVICE } from '../mail/mail.module';
import { REFRESH_COOKIE } from './auth.service';

const PASSWORD = 'RiayaAdmin123!';

function readCookie(res: request.Response, name: string) {
  const headers = res.headers['set-cookie'];
  const list = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const match = list.find((item) => item.startsWith(`${name}=`));
  if (!match) return undefined;
  return match.split(';')[0].split('=')[1];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let fixtureOrganizationId = '';
  let fixtureClinicId = '';
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

  /**
   * An identity alone authorizes nothing since the clinic-scoped role moved to
   * the membership (FR-001, FR-002, FR-028), so the tests that sign in need an
   * ACTIVE membership in the fixture clinic.
   */
  async function createUserWithMembership(email: string, role: UserRole) {
    const user = await app.get(UsersService).createStaffUser({
      email,
      password: PASSWORD,
      firstName: 'Fixture',
      lastName: 'Member',
      role,
    });
    await app.get(PrismaService).userMembership.create({
      data: {
        userId: user.id,
        organizationId: fixtureOrganizationId,
        clinicId: fixtureClinicId,
        role,
        status: 'ACTIVE',
      },
    });
    return user;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-change-me-32chars';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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

    const users = app.get(UsersService);
    const admin = await users.createStaffUser({
      email: 'admin@riaya.local',
      password: PASSWORD,
      firstName: 'Lina',
      lastName: 'Haddad',
      role: UserRole.SUPER_ADMIN,
    });
    const receptionist = await users.createStaffUser({
      email: 'receptionist@riaya.local',
      password: PASSWORD,
      firstName: 'Sara',
      lastName: 'Nasser',
      role: UserRole.RECEPTIONIST,
    });

    // The clinic-scoped role lives on the membership now (FR-001, FR-002,
    // FR-028), so an identity alone authorizes nothing. The fixtures need an
    // organization, a clinic and one ACTIVE membership per user.
    const prisma = app.get(PrismaService);
    const organization = await prisma.organization.create({
      data: { name: 'Fixture Organization', slug: 'fixture-organization' },
    });
    const clinic = await prisma.clinic.create({
      data: { organizationId: organization.id, name: 'Fixture Clinic' },
    });
    fixtureOrganizationId = organization.id;
    fixtureClinicId = clinic.id;
    await prisma.userMembership.create({
      data: {
        userId: admin.id,
        organizationId: organization.id,
        clinicId: clinic.id,
        role: UserRole.SUPER_ADMIN,
        status: 'ACTIVE',
      },
    });
    await prisma.userMembership.create({
      data: {
        userId: receptionist.id,
        organizationId: organization.id,
        clinicId: clinic.id,
        role: UserRole.RECEPTIONIST,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-025 → AC-004
  it('AC-004: logs in with valid credentials and returns an access token plus an HttpOnly refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: PASSWORD })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@riaya.local');
    expect(readCookie(res, REFRESH_COOKIE)).toBeDefined();
  });

  // TEST-026 → AC-006
  it('AC-006: rejects invalid credentials with a generic message that names no field', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: 'WrongPass123!' })
      .expect(401);

    expect(res.body.message).toBe('Invalid credentials');
  });

  // TEST-027 → AC-006
  it('AC-006: answers an unknown email exactly like a wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'missing@riaya.local', password: 'WrongPass123!' })
      .expect(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  // TEST-028 → AC-008, AC-035
  it('AC-008 / AC-035: locks the account after five failed logins and states when it unlocks', async () => {
    await app.get(UsersService).createStaffUser({
      email: 'lockme@riaya.local',
      password: PASSWORD,
      firstName: 'Lock',
      lastName: 'User',
      role: UserRole.DOCTOR,
    });

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lockme@riaya.local', password: 'WrongPass123!' })
        .expect(401);
    }

    const locked = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'lockme@riaya.local', password: PASSWORD })
      .expect(401);
    // AC-035: a locked account must say so and name the unlock time instead of
    // falling back to the generic "Invalid credentials".
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    expect(locked.body.message).toMatch(/temporarily locked/i);
    expect(locked.body.message).toMatch(/15 minute/);
  });

  // TEST-029 → AC-005
  it('AC-005: rotates the refresh token on every refresh and revokes the family on reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: PASSWORD })
      .expect(201);
    const first = readCookie(login, REFRESH_COOKIE);

    const rotated = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${first}`)
      .expect(201);
    const second = readCookie(rotated, REFRESH_COOKIE);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${first}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${second}`)
      .expect(401);
  });

  // TEST-030 → AC-007
  it('AC-007: logs out, revokes the refresh token and rejects it on reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: PASSWORD })
      .expect(201);
    const token = readCookie(login, REFRESH_COOKIE);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`)
      .expect(401);
  });

  it('returns 403 when a receptionist hits an admin-only endpoint', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'receptionist@riaya.local', password: PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        email: 'new.staff@riaya.local',
        password: PASSWORD,
        firstName: 'New',
        lastName: 'Staff',
        role: UserRole.DOCTOR,
      })
      .expect(403);
  });

  // TEST-031 → AC-028
  it('AC-028: emails a single-use expiring reset token without revealing whether the account exists', async () => {
    mail.sendPasswordReset.mockClear();
    const forgotUnknown = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@riaya.local' })
      .expect(201);
    const forgotKnown = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@riaya.local' })
      .expect(201);
    expect(forgotUnknown.body.message).toBe(forgotKnown.body.message);
    expect(mail.sendPasswordReset).toHaveBeenCalled();

    const resetUrl = mail.sendPasswordReset.mock.calls[0][1] as string;
    const token = new URL(resetUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'RiayaAdmin456!' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: 'RiayaAdmin456!' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'RiayaAdmin789!' })
      .expect(400);
  });

  it('returns the current user from /me', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'receptionist@riaya.local', password: PASSWORD })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('receptionist@riaya.local');
    expect(me.body.role).toBe(UserRole.RECEPTIONIST);
  });

  // TEST-032 → AC-029
  it('AC-029: revokes the existing refresh tokens when a new password is set from a reset token', async () => {
    const email = 'resetuser@riaya.local';
    await createUserWithMembership(email, UserRole.DOCTOR);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    const oldCookie = readCookie(login, REFRESH_COOKIE);
    expect(oldCookie).toBeDefined();

    mail.sendPasswordReset.mockClear();
    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email }).expect(201);
    const resetUrl = mail.sendPasswordReset.mock.calls[0][1] as string;
    const token = new URL(resetUrl).searchParams.get('token') ?? '';

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'ResetUser456!' })
      .expect(201);

    // AC-029: the session that existed before the reset must be dead.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${oldCookie}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'ResetUser456!' })
      .expect(201);
  });

  // TEST-051 → AC-038
  it('AC-038: keeps the pre-existing unversioned auth paths working', async () => {
    const email = 'legacy.path@riaya.local';
    await createUserWithMembership(email, UserRole.DOCTOR);

    // No version segment anywhere: these are the paths that shipped before this feature.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${readCookie(login, REFRESH_COOKIE)}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${readCookie(refreshed, REFRESH_COOKIE)}`)
      .expect(201);
  });
});
