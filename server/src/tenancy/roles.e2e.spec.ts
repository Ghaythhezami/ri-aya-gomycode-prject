import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';

/**
 * BP-035 — dynamic roles. Built-ins come from the shared capability matrix;
 * custom roles are clinic-scoped, editable and limited to their base role.
 */
const OWNER_PASSWORD = 'RolesOwner123!';

describe('Custom roles (e2e)', () => {
  let app: INestApplication;
  let token: string;
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
        email: 'roles.owner@riaya.local',
        password: OWNER_PASSWORD,
        firstName: 'Roles',
        lastName: 'Owner',
        organizationName: 'Roles Org',
        clinicName: 'Roles Clinic',
      })
      .expect(201);
    clinicId = owner.body.clinic.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'roles.owner@riaya.local', password: OWNER_PASSWORD })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the built-in roles with their capability sets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(4);
    const superAdmin = res.body.find((role: { id: string }) => role.id === 'SUPER_ADMIN');
    expect(superAdmin).toMatchObject({ isSystem: true, editable: false, accessLevel: 'full' });
    expect(superAdmin.permissions).toContain('manageSettings');
    expect(superAdmin.users).toBe(1);

    const doctor = res.body.find((role: { id: string }) => role.id === 'DOCTOR');
    expect(doctor.permissions).toContain('viewPatients');
    expect(doctor.permissions).not.toContain('manageSettings');
  });

  it('creates, edits and deletes a custom role inside its base role', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Senior Doctor',
        baseRole: 'DOCTOR',
        permissions: ['viewPatients', 'viewAppointments'],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Senior Doctor',
      baseRole: 'DOCTOR',
      isSystem: false,
      editable: true,
      accessLevel: 'limited',
      users: 0,
    });
    const roleId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Lead Doctor', permissions: ['viewPatients'] })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Lead Doctor', permissions: ['viewPatients'] });

    const listed = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: roleId, name: 'Lead Doctor' })]),
    );

    await request(app.getHttpServer())
      .delete(`/api/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.some((role: { id: string }) => role.id === roleId)).toBe(false);

    const prisma = app.get(PrismaService);
    await expect(prisma.role.findMany({ where: { clinicId } })).resolves.toHaveLength(0);
  });

  it('refuses permissions outside the base role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Doctor With Admin Rights',
        baseRole: 'DOCTOR',
        permissions: ['viewPatients', 'manageSettings'],
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_ROLE_PERMISSIONS');
  });

  it('refuses a duplicate role name in the same clinic', async () => {
    await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Triage Nurse', baseRole: 'RECEPTIONIST', permissions: ['viewPatients'] })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Triage Nurse', baseRole: 'RECEPTIONIST', permissions: [] })
      .expect(409);
    expect(duplicate.body.code).toBe('ROLE_NAME_TAKEN');
  });
});
