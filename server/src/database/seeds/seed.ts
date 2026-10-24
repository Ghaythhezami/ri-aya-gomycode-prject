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
  for (const item of DEV_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: item.email } });
    if (existing) {
      console.log(`skip ${item.email} (exists)`);
      continue;
    }
    await prisma.user.create({
      data: {
        email: item.email,
        passwordHash: await argon2.hash(item.password),
        firstName: item.firstName,
        lastName: item.lastName,
        role: item.role,
        preferredLocale: 'en',
        isActive: true,
      },
    });
    console.log(`created ${item.role} ${item.email}`);
  }

  console.log('\nDev accounts (local only):');
  for (const item of DEV_USERS) {
    console.log(`  ${item.role.padEnd(14)} ${item.email} / ${item.password}`);
  }

  await prisma.$disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
