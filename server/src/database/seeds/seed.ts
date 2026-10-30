import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { UserRole } from '../../users/user-role.enum';

loadEnv();

const prisma = new PrismaClient();

const DEV_USERS: Array<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}> = [
  {
    email: 'admin@riaya.local',
    password: 'RiayaAdmin123!',
    firstName: 'Lina',
    lastName: 'Haddad',
    role: UserRole.SUPER_ADMIN,
  },
  {
    email: 'clinic.admin@riaya.local',
    password: 'RiayaClinic123!',
    firstName: 'Omar',
    lastName: 'Farouk',
    role: UserRole.CLINIC_ADMIN,
  },
  {
    email: 'doctor@riaya.local',
    password: 'RiayaDoctor123!',
    firstName: 'Emily',
    lastName: 'Carter',
    role: UserRole.DOCTOR,
  },
  {
    email: 'receptionist@riaya.local',
    password: 'RiayaReception123!',
    firstName: 'Sara',
    lastName: 'Nasser',
    role: UserRole.RECEPTIONIST,
  },
];

async function seed() {
  try {
    await prisma.$connect();
  } catch (error) {
    console.error(
      'Database connection failed. Start PostgreSQL and confirm DATABASE_URL/DB_* settings are valid before running the seed script.',
    );
    throw error;
  }

  // Tenancy baseline: every dev user becomes a member of this organization and
  // clinic, so the existing logins keep working after role moved off `users`
  // (T2.3/T2.4). Idempotent: re-running reuses the same rows.
  const organization = await prisma.organization.upsert({
    where: { slug: 'riaya-demo' },
    update: {},
    create: { name: "RI'AYA Demo Organization", slug: 'riaya-demo' },
  });

  const clinic = await prisma.clinic.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      organizationId: organization.id,
      name: 'Central Clinic',
      timezone: 'UTC',
      currency: 'USD',
      address: '1 Demo Street',
    },
  });

  for (const item of DEV_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: item.email } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email: item.email,
          passwordHash: await argon2.hash(item.password),
          firstName: item.firstName,
          lastName: item.lastName,
          preferredLocale: 'en',
          isActive: true,
        },
      }));

    if (existing) {
      console.log(`skip ${item.email} (exists)`);
    } else {
      console.log(`created ${item.role} ${item.email}`);
    }

    // Membership carries the clinic-scoped role (FR-001, FR-028).
    await prisma.userMembership.upsert({
      where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
      update: { role: item.role, status: 'ACTIVE' },
      create: {
        userId: user.id,
        organizationId: organization.id,
        clinicId: clinic.id,
        role: item.role,
        status: 'ACTIVE',
      },
    });
  }

  console.log('\nDev accounts (local only):');
  for (const item of DEV_USERS) {
    console.log(`  ${item.role.padEnd(14)} ${item.email} / ${item.password}`);
  }
  console.log(`\nWorkspace: ${organization.name} / ${clinic.name} (${clinic.id})`);

  await prisma.$disconnect();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
