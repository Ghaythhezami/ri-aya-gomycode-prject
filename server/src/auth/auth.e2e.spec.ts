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
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

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

  it('logs in with valid credentials and returns access token + refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: PASSWORD })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@riaya.local');
    expect(readCookie(res, REFRESH_COOKIE)).toBeDefined();
  });

  it('rejects invalid credentials with a generic message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@riaya.local', password: 'WrongPass123!' })
      .expect(401);

    expect(res.body.message).toBe('Invalid credentials');
  });

  it('does not reveal whether an unknown email exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'missing@riaya.local', password: 'WrongPass123!' })
      .expect(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('locks the account after five failed logins in the window', async () => {
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

  it('rotates refresh tokens and revokes the family on reuse', async () => {
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

  it('logs out and rejects the refresh token afterwards', async () => {
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

  it('completes the password reset flow', async () => {
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
});
