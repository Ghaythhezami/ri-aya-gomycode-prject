import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * Clinic creation and the organization-wide overview.
 *
 * The overview must read every clinic in the caller's organization, not just the
 * active one, and creating a clinic must add it to the switcher immediately.
 */
const OWNER_PASSWORD = 'OverviewOwner123!';

describe('Organization overview and clinic creation (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clinicId: string;
  let organizationId: string;
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
        email: 'overview.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Overview',
        lastName: 'Owner',
        organizationName: 'Overview Org',
        clinicName: 'Overview Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;
    organizationId = owner.body.organization.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'overview.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates another clinic in the active organization and switches to it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clinics')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Overview Second Clinic' })
      .expect(201);

    expect(created.body.organizationId).toBe(organizationId);
    expect(created.body.clinicId).not.toBe(clinicId);
    expect(created.body.role).toBe('SUPER_ADMIN');

    // A SUPER_ADMIN sees every clinic of the organization, including the new one.
    const memberships = await request(app.getHttpServer())
      .get('/api/auth/memberships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const clinicIds = memberships.body.map(
      (membership: { clinicId: string }) => membership.clinicId,
    );
    expect(clinicIds).toEqual(expect.arrayContaining([clinicId, created.body.clinicId]));

    // The new clinic is a real workspace, not just a row: it can be opened.
    const switched = await request(app.getHttpServer())
      .post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ clinicId: created.body.clinicId })
      .expect(201);
    expect(switched.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a clinic without a usable name', async () => {
    await request(app.getHttpServer())
      .post('/api/clinics')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: ' ' })
      .expect(400);
  });

  it('aggregates every clinic of the organization, not only the active one', async () => {
    const prisma = app.get(PrismaService);

    // Make the fixture independent of the creation test above.
    let clinics = await prisma.clinic.findMany({ where: { organizationId } });
    if (clinics.length < 2) {
      await prisma.clinic.create({ data: { organizationId, name: 'Overview Extra Clinic' } });
      clinics = await prisma.clinic.findMany({ where: { organizationId } });
    }
    const otherClinic = clinics.find((clinic) => clinic.id !== clinicId);
    if (!otherClinic) throw new Error('expected a second clinic in the organization');

    // Guarantee a membership outside the active clinic, so the member total is
    // an organization-wide sum rather than a single-clinic count.
    const owner = await prisma.user.findUnique({ where: { email: 'overview.owner@riaya.local' } });
    if (!owner) throw new Error('owner identity is missing');
    const otherMembership = await prisma.userMembership.findFirst({
      where: { userId: owner.id, clinicId: otherClinic.id },
    });
    if (!otherMembership) {
      await prisma.userMembership.create({
        data: {
          userId: owner.id,
          organizationId,
          clinicId: otherClinic.id,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
    }

    const patient = await prisma.patient.create({
      data: {
        clinicId,
        firstName: 'Org',
        lastName: 'Patient',
        dateOfBirth: new Date('1990-01-01'),
        phone: '+10000000000',
      },
    });
    const doctor = await prisma.doctor.create({
      data: { clinicId, specialty: 'General Practice' },
    });
    await prisma.doctor.create({
      data: { clinicId: otherClinic.id, specialty: 'Cardiology' },
    });

    // One appointment earlier today (counts toward today, not upcoming).
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startsAt = new Date(startOfDay.getTime() + 60 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        clinicId,
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        status: 'SCHEDULED',
      },
    });

    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'overview.pending@riaya.local', clinicId, role: 'DOCTOR' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/organizations/overview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.organization).toEqual({ id: organizationId, name: 'Overview Org' });
    expect(response.body.totals.clinics).toBe(clinics.length);
    expect(response.body.totals.patients).toBe(1);
    expect(response.body.totals.doctors).toBe(2);
    expect(response.body.totals.todayAppointments).toBe(1);
    expect(response.body.totals.upcomingAppointments).toBe(0);
    expect(response.body.totals.pendingInvitations).toBe(1);
    expect(response.body.totals.members).toBeGreaterThanOrEqual(2);

    const activeRow = response.body.clinics.find(
      (clinic: { id: string }) => clinic.id === clinicId,
    );
    expect(activeRow).toMatchObject({
      patients: 1,
      doctors: 1,
      todayAppointments: 1,
      upcomingAppointments: 0,
    });

    const otherRow = response.body.clinics.find(
      (clinic: { id: string }) => clinic.id === otherClinic.id,
    );
    expect(otherRow).toMatchObject({
      patients: 0,
      doctors: 1,
      todayAppointments: 0,
    });
  });
});
