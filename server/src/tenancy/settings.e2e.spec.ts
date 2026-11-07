import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * BP-035 — clinic settings. The active clinic is the only editable scope, and a
 * caller without `manageSettings` cannot read or write it.
 */
const OWNER_PASSWORD = 'SettingsOwner123!';
const INVITEE_PASSWORD = 'SettingsDoctor123!';

const WEEK = {
  monday: { open: true, start: '08:00', end: '17:00', breaks: [] },
  tuesday: { open: true, start: '08:00', end: '17:00', breaks: [] },
  wednesday: { open: true, start: '08:00', end: '17:00', breaks: [] },
  thursday: { open: true, start: '08:00', end: '17:00', breaks: [] },
  friday: { open: true, start: '08:00', end: '13:00', breaks: [] },
  saturday: { open: false, start: '08:00', end: '17:00', breaks: [] },
  sunday: { open: false, start: '08:00', end: '17:00', breaks: [] },
};

describe('Clinic settings (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clinicId: string;
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
        email: 'settings.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Settings',
        lastName: 'Owner',
        organizationName: 'Settings Org',
        clinicName: 'Central Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'settings.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the active clinic with the default week', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: clinicId,
      name: 'Central Clinic',
      defaultLanguage: 'en',
      timezone: 'UTC',
    });
    expect(res.body.workingHours.monday).toMatchObject({
      open: true,
      start: '08:00',
      end: '17:00',
    });
    expect(res.body.workingHours.friday).toMatchObject({ open: true, end: '13:00' });
    expect(res.body.workingHours.saturday.open).toBe(false);
    expect(res.body.workingHours.sunday.open).toBe(false);
  });

  it('updates clinic details and working hours, and persists them', async () => {
    const monday = {
      ...WEEK.monday,
      breaks: [{ start: '12:00', end: '13:00' }],
    };

    const updated = await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Central Clinic — Lagos',
        address: '12 Marina Road, Lagos',
        contactEmail: 'Operations@CentralClinic.Example',
        phone: '+234 800 000 0000',
        defaultLanguage: 'ar',
        timezone: 'Africa/Lagos',
        workingHours: { ...WEEK, monday },
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Central Clinic — Lagos',
      address: '12 Marina Road, Lagos',
      contactEmail: 'operations@centralclinic.example',
      phone: '+234 800 000 0000',
      defaultLanguage: 'ar',
      timezone: 'Africa/Lagos',
    });
    expect(updated.body.workingHours.monday.breaks).toEqual([{ start: '12:00', end: '13:00' }]);

    const reread = await request(app.getHttpServer())
      .get('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(reread.body).toMatchObject({
      name: 'Central Clinic — Lagos',
      contactEmail: 'operations@centralclinic.example',
      timezone: 'Africa/Lagos',
    });
  });

  it('rejects an invalid time zone', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ timezone: 'Mars/Olympus' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_TIMEZONE');
  });

  it('rejects a working day whose end is before its start', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        workingHours: {
          ...WEEK,
          monday: { ...WEEK.monday, start: '18:00', end: '09:00' },
        },
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_WORKING_HOURS');
  });

  it('rejects duplicate or overlapping breaks on the same day', async () => {
    const duplicate = await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        workingHours: {
          ...WEEK,
          monday: {
            ...WEEK.monday,
            breaks: [
              { start: '12:00', end: '13:00' },
              { start: '12:00', end: '13:00' },
            ],
          },
        },
      })
      .expect(400);
    expect(duplicate.body.code).toBe('INVALID_BREAKS');

    const overlap = await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        workingHours: {
          ...WEEK,
          monday: {
            ...WEEK.monday,
            breaks: [
              { start: '12:00', end: '13:00' },
              { start: '12:30', end: '13:30' },
            ],
          },
        },
      })
      .expect(400);
    expect(overlap.body.code).toBe('INVALID_BREAKS');

    await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        workingHours: {
          ...WEEK,
          monday: {
            ...WEEK.monday,
            breaks: [
              { start: '12:00', end: '13:00' },
              { start: '14:00', end: '15:00' },
            ],
          },
        },
      })
      .expect(200);
  });

  it('refuses a doctor access to the settings endpoints', async () => {
    mail.sendInvitation.mockClear();
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'settings.doctor@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);
    const acceptUrl = mail.sendInvitation.mock.calls[0][0].acceptUrl as string;
    const token = new URL(acceptUrl).searchParams.get('token') ?? '';

    await request(app.getHttpServer())
      .post('/api/auth/accept-invite')
      .send({
        token,
        password: INVITEE_PASSWORD,
        firstName: 'Settings',
        lastName: 'Doctor',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'settings.doctor@riaya.local', password: INVITEE_PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/clinics/settings')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/clinics/settings')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ name: 'Hijacked Clinic' })
      .expect(403);

    // The refused write changed nothing.
    const prisma = app.get(PrismaService);
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    expect(clinic?.name).toBe('Central Clinic — Lagos');
  });
});
