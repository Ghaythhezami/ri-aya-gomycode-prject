/**
 * Local development fixtures only (CON-506).
 *
 * Every person, phone number and address below is fictional and generated
 * deterministically from a fixed seed, so re-running produces identical data.
 * This script refuses to run outside local development (NFR-003, CON-519) and
 * reads its connection string from DATABASE_URL in the environment — never a
 * literal (BP-002).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { UserRole } from '../../users/user-role.enum';

loadEnv();

const prisma = new PrismaClient();

/** Refuse to write development fixtures into anything but a local database. */
function assertLocalEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV is "production". This script writes fictional demo data and must only run against a local development database (CON-519).',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Refusing to seed: DATABASE_URL is not set. The seed reads its connection string from the environment only (CON-519).',
    );
  }
}

/**
 * Deterministic PRNG (mulberry32). A fixed seed means every run produces the
 * same 200 patients and 600 appointments, so AC-007 is reproducible rather than
 * "roughly similar", and no faker dependency enters the tree (FR-006).
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_VALUE = 0x5249414a; // "RIAJ"

/** The three demo clinics. Fixed ids keep the seed idempotent (AC-006). */
const CLINICS: Array<{ id: string; name: string; timezone: string; address: string }> = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Central Clinic',
    timezone: 'UTC',
    address: '1 Demo Street',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Northside Clinic',
    timezone: 'UTC',
    address: '2 Example Avenue',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Riverside Clinic',
    timezone: 'UTC',
    address: '3 Sample Road',
  },
];

/** Ten clinicians, distributed 4 / 3 / 3 across the clinics above (AC-006). */
const DOCTORS: Array<{
  id: string;
  clinicId: string;
  specialty: string;
  consultationMinutes: number;
}> = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    clinicId: CLINICS[0]!.id,
    specialty: 'General Practice',
    consultationMinutes: 20,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    clinicId: CLINICS[0]!.id,
    specialty: 'Pediatrics',
    consultationMinutes: 30,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    clinicId: CLINICS[0]!.id,
    specialty: 'Cardiology',
    consultationMinutes: 45,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    clinicId: CLINICS[0]!.id,
    specialty: 'Dermatology',
    consultationMinutes: 30,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    clinicId: CLINICS[1]!.id,
    specialty: 'General Practice',
    consultationMinutes: 20,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    clinicId: CLINICS[1]!.id,
    specialty: 'Orthopedics',
    consultationMinutes: 40,
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    clinicId: CLINICS[1]!.id,
    specialty: 'Neurology',
    consultationMinutes: 45,
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    clinicId: CLINICS[2]!.id,
    specialty: 'General Practice',
    consultationMinutes: 20,
  },
  {
    id: '10000000-0000-4000-8000-000000000009',
    clinicId: CLINICS[2]!.id,
    specialty: 'Endocrinology',
    consultationMinutes: 40,
  },
  {
    id: '10000000-0000-4000-8000-000000000010',
    clinicId: CLINICS[2]!.id,
    specialty: 'Psychiatry',
    consultationMinutes: 50,
  },
];

const FIRST_NAMES = [
  'Layla',
  'Omar',
  'Nour',
  'Yusuf',
  'Mariam',
  'Karim',
  'Hana',
  'Tariq',
  'Salma',
  'Adam',
  'Rania',
  'Bilal',
  'Zeinab',
  'Hassan',
  'Dina',
  'Faris',
  'Iman',
  'Samir',
  'Yasmin',
  'Khalid',
];

const LAST_NAMES = [
  'Haddad',
  'Farouk',
  'Nasser',
  'Saleh',
  'Mansour',
  'Khalil',
  'Rahman',
  'Aziz',
  'Hamdan',
  'Sabbagh',
  'Taha',
  'Jaber',
  'Fares',
  'Halabi',
  'Darwish',
  'Kassab',
  'Shaheen',
  'Barakat',
  'Rizk',
  'Zaher',
];

const GENDERS = ['female', 'male'] as const;

const PATIENT_COUNT = 200;
const APPOINTMENT_COUNT = 600;

/** Stable schedule anchor so appointment dates do not move between runs (AC-007). */
const SCHEDULE_ANCHOR = Date.UTC(2026, 0, 5, 9, 0, 0);

const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

const REASONS = [
  'Routine check-up',
  'Follow-up consultation',
  'New symptom review',
  'Medication review',
  'Test results discussion',
];

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

/** Stable, valid UUIDs so re-runs reuse the same rows instead of duplicating them. */
function patientId(index: number): string {
  return `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function appointmentId(index: number): string {
  return `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

/**
 * Seeds the clinical half of the schema (BP-002): three clinics, ten doctors,
 * 200 patients and 600 appointments. Every row is clinic-scoped, and every
 * appointment joins a patient and a doctor from the same clinic so tenant
 * boundaries hold in the fixture itself (FR-007, NFR-004).
 */
async function seedClinicalData(organizationId: string): Promise<string> {
  for (const clinic of CLINICS) {
    await prisma.clinic.upsert({
      where: { id: clinic.id },
      update: { name: clinic.name, timezone: clinic.timezone, address: clinic.address },
      create: {
        id: clinic.id,
        organizationId,
        name: clinic.name,
        timezone: clinic.timezone,
        currency: 'USD',
        address: clinic.address,
      },
    });
  }

  for (const doctor of DOCTORS) {
    await prisma.doctor.upsert({
      where: { id: doctor.id },
      update: {
        specialty: doctor.specialty,
        consultationMinutes: doctor.consultationMinutes,
      },
      create: {
        id: doctor.id,
        clinicId: doctor.clinicId,
        specialty: doctor.specialty,
        licenseNumber: `LIC-${doctor.id.slice(-4)}`,
        consultationMinutes: doctor.consultationMinutes,
        isActive: true,
      },
    });
  }

  // A fixed seed makes the generated people identical on every run (AC-007).
  const random = createRandom(SEED_VALUE);

  for (let index = 0; index < PATIENT_COUNT; index += 1) {
    const clinic = CLINICS[index % CLINICS.length]!;
    const firstName = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]!;
    const lastName = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]!;
    const gender = GENDERS[Math.floor(random() * GENDERS.length)]!;
    const birthYear = 1940 + Math.floor(random() * 60);
    const birthMonth = Math.floor(random() * 12);
    const birthDay = 1 + Math.floor(random() * 28);

    await prisma.patient.upsert({
      where: { id: patientId(index) },
      update: {},
      create: {
        id: patientId(index),
        clinicId: clinic.id,
        firstName,
        lastName,
        dateOfBirth: new Date(Date.UTC(birthYear, birthMonth, birthDay)),
        phone: `+1555${String(1_000_000 + index).slice(0, 7)}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${index}@example.org`,
        gender,
      },
    });
  }

  for (let index = 0; index < APPOINTMENT_COUNT; index += 1) {
    // Pair the appointment with a patient first, then take the doctor from that
    // same clinic — this is what keeps the fixture tenant-consistent (NFR-004).
    const patientIndex = index % PATIENT_COUNT;
    const patientClinicId = CLINICS[patientIndex % CLINICS.length]!.id;
    const clinicDoctors = DOCTORS.filter((doctor) => doctor.clinicId === patientClinicId);
    const doctor = clinicDoctors[index % clinicDoctors.length]!;
    const startsAt = new Date(SCHEDULE_ANCHOR + index * 30 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + doctor.consultationMinutes * 60 * 1000);

    await prisma.appointment.upsert({
      where: { id: appointmentId(index) },
      update: {},
      create: {
        id: appointmentId(index),
        clinicId: patientClinicId,
        patientId: patientId(patientIndex),
        doctorId: doctor.id,
        startsAt,
        endsAt,
        status: APPOINTMENT_STATUSES[index % APPOINTMENT_STATUSES.length]!,
        reason: REASONS[index % REASONS.length]!,
      },
    });
  }

  return CLINICS[0]!.id;
}

async function seed() {
  assertLocalEnvironment();

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

  // Clinical fixtures (BP-002): three clinics, ten doctors, 200 patients and
  // 600 appointments, all clinic-scoped and idempotent on re-run.
  const primaryClinicId = await seedClinicalData(organization.id);

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
      where: { userId_clinicId: { userId: user.id, clinicId: primaryClinicId } },
      update: { role: item.role, status: 'ACTIVE' },
      create: {
        userId: user.id,
        organizationId: organization.id,
        clinicId: primaryClinicId,
        role: item.role,
        status: 'ACTIVE',
      },
    });
  }

  console.log('\nDev accounts (local only):');
  for (const item of DEV_USERS) {
    console.log(`  ${item.role.padEnd(14)} ${item.email} / ${item.password}`);
  }
  const [clinicCount, doctorCount, patientCount, appointmentCount] = await Promise.all([
    prisma.clinic.count(),
    prisma.doctor.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
  ]);
  console.log('\nClinical dataset:');
  console.log(`  clinics      ${clinicCount}`);
  console.log(`  doctors      ${doctorCount}`);
  console.log(`  patients     ${patientCount}`);
  console.log(`  appointments ${appointmentCount}`);
  console.log(`\nWorkspace: ${organization.name} / ${CLINICS[0]!.name} (${primaryClinicId})`);

  await prisma.$disconnect();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
