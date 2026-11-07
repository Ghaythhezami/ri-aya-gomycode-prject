/**
 * Local development fixtures only (CON-506).
 *
 * Every person, phone number and address below is fictional and generated
 * deterministically from a fixed seed, so re-running produces the same people.
 * Appointment dates are RELATIVE TO THE DAY THE SEED RUNS (in each clinic's time
 * zone) so the demo always looks alive. Idempotent: the clinical rows of the three
 * demo clinics are deleted and recreated inside one transaction (audit rows are
 * never touched). This script refuses to run outside local development (NFR-003,
 * CON-519) and reads its connection string from DATABASE_URL (BP-002).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { addDays, localMinuteOfDay, localToUtc, todayIn, weekdayOf } from '../../core/clinic-time';
import { UserRole } from '../../users/user-role.enum';
import { buildSearchText } from '../../common/locale/localized-input';
import { clinicNameI18n, nameI18n, roomNameI18n } from './seed-names';

/** Set by runSeed: the CLI passes its own client, the demo-reset job passes the app's. */
let prisma: PrismaClient;

/** Refuse to write development fixtures into anything but a local database. */
function assertLocalEnvironment(options: SeedOptions): void {
  if (options.demoReset) return;
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

/** Deterministic PRNG (mulberry32): no faker dependency, reproducible people. */
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
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type AppointmentType = 'CONSULTATION' | 'FOLLOW_UP' | 'EMERGENCY';
type AppointmentStatus =
  'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const DURATIONS: Record<AppointmentType, number> = {
  CONSULTATION: 30,
  FOLLOW_UP: 15,
  EMERGENCY: 20,
};

/** Stable, valid-looking UUIDs so re-runs recreate identical ids. */
function fid(prefix: string, n: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const CLINICS: Array<{
  id: string;
  name: string;
  timezone: string;
  currency: string;
  address: string;
  email: string;
  phone: string;
  patients: number;
}> = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Central Clinic',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    address: 'Healthcare District, Dubai, UAE',
    email: 'operations@centralclinic.example',
    phone: '+971 4 123 4567',
    patients: 110,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Northside Clinic',
    timezone: 'Africa/Tunis',
    currency: 'TND',
    address: 'Avenue Habib Bourguiba, Tunis, Tunisia',
    email: 'operations@northsideclinic.example',
    phone: '+216 71 123 456',
    patients: 50,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Riverside Clinic',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    address: '12 Rue de Rivoli, 75001 Paris, France',
    email: 'operations@riversideclinic.example',
    phone: '+33 1 23 45 67 89',
    patients: 40,
  },
];

const ROOMS: Array<Array<{ name: string; kind: string }>> = [
  [
    { name: 'Room 1', kind: 'CONSULTATION' },
    { name: 'Room 2', kind: 'CONSULTATION' },
    { name: 'Room 3', kind: 'CONSULTATION' },
    { name: 'Room 4', kind: 'CONSULTATION' },
    { name: 'Procedure Room', kind: 'PROCEDURE' },
    { name: 'Imaging Room', kind: 'IMAGING' },
  ],
  [
    { name: 'Room 1', kind: 'CONSULTATION' },
    { name: 'Room 2', kind: 'CONSULTATION' },
    { name: 'Room 3', kind: 'CONSULTATION' },
    { name: 'Procedure Room', kind: 'PROCEDURE' },
  ],
  [
    { name: 'Room 1', kind: 'CONSULTATION' },
    { name: 'Room 2', kind: 'CONSULTATION' },
    { name: 'Room 3', kind: 'CONSULTATION' },
    { name: 'Procedure Room', kind: 'PROCEDURE' },
  ],
];

interface HourRule {
  weekdays: number[];
  start: number;
  end: number;
  breakStart?: number;
  breakEnd?: number;
}

const STANDARD: HourRule = {
  weekdays: [1, 2, 3, 4, 5],
  start: 480,
  end: 1020,
  breakStart: 750,
  breakEnd: 810,
};

/** Ten clinicians, 4 / 3 / 3. Doctor ids are kept stable from earlier seeds. */
/** [minutes after the doctor's opening, type, locked] — back-to-back runs and idle gaps. */
const DEMO_PATTERNS: Array<Array<[number, AppointmentType, boolean]>> = [
  // A: 8 consecutive consultations, then scattered afternoon visits.
  [
    ...[0, 30, 60, 90, 120, 150, 180, 210].map((m): [number, AppointmentType, boolean] => [
      m,
      'CONSULTATION',
      false,
    ]),
    [345, 'FOLLOW_UP', false],
    [420, 'CONSULTATION', false],
    [480, 'FOLLOW_UP', false],
  ],
  // B: 7 consecutive consultations, one pinned afternoon visit.
  [
    ...[0, 30, 60, 90, 120, 150, 180].map((m): [number, AppointmentType, boolean] => [
      m,
      'CONSULTATION',
      false,
    ]),
    [330, 'CONSULTATION', true],
    [390, 'FOLLOW_UP', false],
    [450, 'CONSULTATION', false],
  ],
  // C: sparse, long idle gaps.
  [
    [0, 'FOLLOW_UP', false],
    [60, 'CONSULTATION', false],
    [150, 'FOLLOW_UP', false],
    [300, 'CONSULTATION', false],
    [390, 'FOLLOW_UP', false],
    [435, 'FOLLOW_UP', false],
  ],
  // D: sparse with a pinned emergency.
  [
    [0, 'CONSULTATION', false],
    [75, 'FOLLOW_UP', false],
    [180, 'EMERGENCY', true],
    [330, 'CONSULTATION', false],
    [375, 'CONSULTATION', false],
    [450, 'FOLLOW_UP', false],
  ],
];

const DOCTORS: Array<{
  id: string;
  clinic: number;
  firstName: string;
  lastName: string;
  specialty: string;
  minutes: number;
  room: string;
  userEmail?: string;
  hours: HourRule[];
}> = [
  {
    id: fid('1', 1),
    clinic: 0,
    firstName: 'Emily',
    lastName: 'Carter',
    specialty: 'General Medicine',
    minutes: 30,
    room: 'Room 1',
    userEmail: 'doctor@riaya.local',
    hours: [{ ...STANDARD, weekdays: [0, 1, 2, 3, 4, 5] }],
  },
  {
    id: fid('1', 2),
    clinic: 0,
    firstName: 'James',
    lastName: 'Wilson',
    specialty: 'Cardiology',
    minutes: 30,
    room: 'Room 2',
    hours: [
      {
        weekdays: [0, 1, 2, 3, 4, 5],
        start: 600,
        end: 1080,
        breakStart: 810,
        breakEnd: 870,
      },
    ],
  },
  {
    id: fid('1', 3),
    clinic: 0,
    firstName: 'Sarah',
    lastName: 'Ahmed',
    specialty: 'Pediatrics',
    minutes: 30,
    room: 'Room 3',
    // Friday is a half day with no break.
    hours: [
      { ...STANDARD, weekdays: [0, 1, 2, 3, 4] },
      { weekdays: [5], start: 480, end: 720 },
    ],
  },
  {
    id: fid('1', 4),
    clinic: 0,
    firstName: 'Robert',
    lastName: 'Kim',
    specialty: 'Dermatology',
    minutes: 30,
    room: 'Room 4',
    hours: [{ ...STANDARD, weekdays: [0, 1, 2, 3, 4, 5] }],
  },
  {
    id: fid('1', 5),
    clinic: 1,
    firstName: 'Lisa',
    lastName: 'Brown',
    specialty: 'Internal Medicine',
    minutes: 30,
    room: 'Room 1',
    hours: [STANDARD],
  },
  {
    id: fid('1', 6),
    clinic: 1,
    firstName: 'Omar',
    lastName: 'Farouk',
    specialty: 'Orthopedics',
    minutes: 30,
    room: 'Room 2',
    hours: [STANDARD],
  },
  {
    id: fid('1', 7),
    clinic: 1,
    firstName: 'Nadia',
    lastName: 'Mansour',
    specialty: 'General Medicine',
    minutes: 30,
    room: 'Room 3',
    hours: [STANDARD],
  },
  {
    id: fid('1', 8),
    clinic: 2,
    firstName: 'Claire',
    lastName: 'Dubois',
    specialty: 'Dermatology',
    minutes: 30,
    room: 'Room 1',
    hours: [STANDARD],
  },
  {
    id: fid('1', 9),
    clinic: 2,
    firstName: 'Thomas',
    lastName: 'Martin',
    specialty: 'Pediatrics',
    minutes: 30,
    room: 'Room 2',
    hours: [STANDARD],
  },
  {
    id: fid('1', 10),
    clinic: 2,
    firstName: 'Yasmine',
    lastName: 'Haddad',
    specialty: 'Cardiology',
    minutes: 30,
    room: 'Room 3',
    hours: [{ ...STANDARD, start: 600, end: 1080, breakStart: 810, breakEnd: 870 }],
  },
];

/** Leaves relative to today (inclusive day offsets). */
const LEAVES: Array<{ doctorId: string; from: number; to: number; reason: string }> = [
  { doctorId: fid('1', 6), from: -1, to: 3, reason: 'Annual leave' },
  { doctorId: fid('1', 4), from: 10, to: 12, reason: 'Medical conference' },
];

// ------------------------------------------------------------------ people

const ARABIC_MALE = [
  'Omar',
  'Yusuf',
  'Karim',
  'Tariq',
  'Adam',
  'Bilal',
  'Hassan',
  'Faris',
  'Samir',
  'Khalid',
  'Ahmed',
  'Mahmoud',
  'Ibrahim',
  'Zaid',
  'Hamza',
  'Mehdi',
];
const ARABIC_FEMALE = [
  'Layla',
  'Nour',
  'Mariam',
  'Hana',
  'Salma',
  'Rania',
  'Zeinab',
  'Dina',
  'Iman',
  'Yasmin',
  'Amira',
  'Huda',
  'Leila',
  'Aisha',
  'Fatima',
];
const FRENCH_MALE = ['Louis', 'Hugo', 'Lucas', 'Antoine', 'Julien', 'Mathieu', 'Pierre', 'Nicolas'];
const FRENCH_FEMALE = ['Camille', 'Chloe', 'Emma', 'Lea', 'Manon', 'Sophie', 'Margaux', 'Claire'];
const ENGLISH_MALE = [
  'James',
  'Michael',
  'David',
  'Robert',
  'Daniel',
  'Thomas',
  'William',
  'Oliver',
];
const ENGLISH_FEMALE = ['Sarah', 'Emily', 'Olivia', 'Grace', 'Hannah', 'Jessica', 'Laura', 'Megan'];
const ARABIC_LAST = [
  'Haddad',
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
  'Hassan',
  'Khan',
  'Mansoori',
];
const FRENCH_LAST = [
  'Dubois',
  'Moreau',
  'Laurent',
  'Lefevre',
  'Girard',
  'Bonnet',
  'Fontaine',
  'Rousseau',
  'Petit',
  'Garnier',
];
const ENGLISH_LAST = [
  'Johnson',
  'Brown',
  'Lee',
  'Miller',
  'Taylor',
  'Walker',
  'Hughes',
  'Reid',
  'Clarke',
  'Bennett',
];

/** Group weights per clinic: [arabic, french, english]. */
const NAME_MIX: Array<[number, number, number]> = [
  [0.5, 0.1, 0.4],
  [0.65, 0.3, 0.05],
  [0.2, 0.6, 0.2],
];

const MOCKUP_PATIENTS: Array<{ firstName: string; lastName: string; gender: 'female' | 'male' }> = [
  { firstName: 'Sarah', lastName: 'Johnson', gender: 'female' },
  { firstName: 'Michael', lastName: 'Brown', gender: 'male' },
  { firstName: 'Aisha', lastName: 'Khan', gender: 'female' },
  { firstName: 'David', lastName: 'Lee', gender: 'male' },
  { firstName: 'Fatima', lastName: 'Hassan', gender: 'female' },
  { firstName: 'James', lastName: 'Miller', gender: 'male' },
];

const ADMIN_NOTES = [
  'Prefers morning appointments',
  'Requires Arabic/English interpreter',
  'Insurance card on file',
  'Wheelchair access needed',
  'Call before sending SMS reminders',
  'Guardian attends all visits',
];
const CLINICAL_NOTES = [
  'Hypertension, monitored quarterly',
  'Penicillin allergy',
  'Type 2 diabetes, HbA1c every 3 months',
  'Asthma, uses inhaler as needed',
  'No known allergies',
  'Seasonal allergic rhinitis',
  'Post-operative review scheduled',
];

const REASONS: Record<AppointmentType, string[]> = {
  CONSULTATION: [
    'Routine check-up',
    'New symptom review',
    'Medication review',
    'Test results discussion',
    'Annual health assessment',
  ],
  FOLLOW_UP: [
    'Follow-up consultation',
    'Post-treatment review',
    'Blood pressure check',
    'Lab results follow-up',
  ],
  EMERGENCY: ['Acute pain', 'High fever', 'Allergic reaction', 'Minor injury'],
};

const CANCEL_REASONS = [
  'Patient requested to reschedule',
  'Patient unwell',
  'Schedule conflict',
  'Patient did not need the visit anymore',
  'Doctor unavailable',
];

// ------------------------------------------------------------------ dev users

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

// ------------------------------------------------------------------ builders

interface PatientRow {
  id: string;
  clinicId: string;
  code: string;
  firstName: string;
  lastName: string;
  firstNameI18n: Prisma.InputJsonValue;
  lastNameI18n: Prisma.InputJsonValue;
  searchText: string;
  dateOfBirth: Date;
  phone: string;
  email: string;
  gender: string;
  address: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: Date | null;
  clinicalNotes: string | null;
  adminNotes: string | null;
  contactPreference: string;
  createdAt: Date;
}

interface PlannedAppointment {
  clinic: number;
  doctorId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  type: AppointmentType;
  status: AppointmentStatus;
  cancelReason: string | null;
  dayOffset: number;
  patientId: string;
  reason: string;
  id: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  locked: boolean;
}

interface WorkRow {
  id: string;
  doctorId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  kind: string;
}

function freeIntervals(rows: WorkRow[], weekday: number): Array<[number, number]> {
  const work = rows.filter((r) => r.weekday === weekday && r.kind === 'WORK');
  const breaks = rows.filter((r) => r.weekday === weekday && r.kind === 'BREAK');
  let out: Array<[number, number]> = work.map((w) => [w.startMinute, w.endMinute]);
  for (const b of breaks) {
    out = out.flatMap(([s, e]): Array<[number, number]> => {
      if (b.endMinute <= s || b.startMinute >= e) return [[s, e]];
      const parts: Array<[number, number]> = [];
      if (b.startMinute > s) parts.push([s, b.startMinute]);
      if (b.endMinute < e) parts.push([b.endMinute, e]);
      return parts;
    });
  }
  return out;
}

async function seedClinicalData(
  organizationId: string,
  userIds: Record<string, string>,
): Promise<void> {
  const random = createRandom(SEED_VALUE);
  const int = (n: number): number => Math.floor(random() * n);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
  const now = new Date();

  // ---- clinics (upsert; they must exist before memberships are written)
  // done by the caller; here we only build the clinical rows.

  // ---- rooms
  const roomRows: Array<{
    id: string;
    clinicId: string;
    name: string;
    nameI18n: Prisma.InputJsonValue;
    kind: string;
  }> = [];
  const roomIdByName = new Map<string, string>();
  CLINICS.forEach((clinic, ci) => {
    ROOMS[ci]!.forEach((room, ri) => {
      const id = fid('4', ci * 10 + ri + 1);
      roomRows.push({
        id,
        clinicId: clinic.id,
        name: room.name,
        nameI18n: roomNameI18n(room.name),
        kind: room.kind,
      });
      roomIdByName.set(`${ci}:${room.name}`, id);
    });
  });

  // ---- doctors, working hours, leaves
  const doctorRows = DOCTORS.map((d) => ({
    id: d.id,
    clinicId: CLINICS[d.clinic]!.id,
    userId: d.userEmail ? (userIds[d.userEmail] ?? null) : null,
    firstName: d.firstName,
    lastName: d.lastName,
    firstNameI18n: nameI18n(d.firstName),
    lastNameI18n: nameI18n(d.lastName),
    specialty: d.specialty,
    licenseNumber: `LIC-${String(d.id.slice(-4))}`,
    consultationMinutes: d.minutes,
    isActive: true,
    roomId: roomIdByName.get(`${d.clinic}:${d.room}`) ?? null,
  }));

  const hourRows: WorkRow[] = [];
  let hourSeq = 1;
  for (const d of DOCTORS) {
    for (const rule of d.hours) {
      for (const weekday of rule.weekdays) {
        hourRows.push({
          id: fid('c', hourSeq++),
          doctorId: d.id,
          weekday,
          startMinute: rule.start,
          endMinute: rule.end,
          kind: 'WORK',
        });
        if (rule.breakStart !== undefined && rule.breakEnd !== undefined) {
          hourRows.push({
            id: fid('c', hourSeq++),
            doctorId: d.id,
            weekday,
            startMinute: rule.breakStart,
            endMinute: rule.breakEnd,
            kind: 'BREAK',
          });
        }
      }
    }
  }

  const todays = CLINICS.map((c) => todayIn(c.timezone, now));
  const leaveRows = LEAVES.map((leave, i) => {
    const doctor = DOCTORS.find((d) => d.id === leave.doctorId)!;
    const tz = CLINICS[doctor.clinic]!.timezone;
    const today = todays[doctor.clinic]!;
    return {
      id: fid('b', i + 1),
      doctorId: leave.doctorId,
      startsAt: localToUtc(addDays(today, leave.from), 0, tz),
      endsAt: localToUtc(addDays(today, leave.to + 1), 0, tz),
      reason: leave.reason,
    };
  });

  // ---- patients
  const patientRows: PatientRow[] = [];
  const patientsByClinic: PatientRow[][] = [[], [], []];
  const usedNames = new Set<string>();
  const usedEmails = new Set<string>();
  CLINICS.forEach((clinic, ci) => {
    const mix = NAME_MIX[ci]!;
    for (let n = 0; n < clinic.patients; n += 1) {
      let firstName: string;
      let lastName: string;
      let gender: 'female' | 'male';
      if (ci === 0 && n < MOCKUP_PATIENTS.length) {
        ({ firstName, lastName, gender } = MOCKUP_PATIENTS[n]!);
      } else {
        for (;;) {
          const roll = random();
          gender = random() < 0.5 ? 'female' : 'male';
          if (roll < mix[0]) {
            firstName = pick(gender === 'female' ? ARABIC_FEMALE : ARABIC_MALE);
            lastName = pick(ARABIC_LAST);
          } else if (roll < mix[0] + mix[1]) {
            firstName = pick(gender === 'female' ? FRENCH_FEMALE : FRENCH_MALE);
            lastName = pick(FRENCH_LAST);
          } else {
            firstName = pick(gender === 'female' ? ENGLISH_FEMALE : ENGLISH_MALE);
            lastName = pick(ENGLISH_LAST);
          }
          if (!usedNames.has(`${ci}:${firstName} ${lastName}`)) break;
        }
      }
      usedNames.add(`${ci}:${firstName} ${lastName}`);

      let email = `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, '');
      let suffix = 1;
      while (usedEmails.has(email))
        email = `${firstName}.${lastName}${suffix++}`.toLowerCase().replace(/\s+/g, '');
      usedEmails.add(email);

      const d3 = (): number => 100 + int(900);
      const d4 = (): number => 1000 + int(9000);
      const d2 = (): string => String(10 + int(90));
      const phone =
        ci === 0
          ? `+971 5${pick(['0', '2', '4', '5', '6'])} ${d3()} ${d4()}`
          : ci === 1
            ? `+216 ${pick(['20', '22', '50', '55', '98'])} ${d3()} ${d3()}`
            : `+33 6 ${d2()} ${d2()} ${d2()} ${d2()}`;

      const archived = (ci === 0 && [20, 41, 63, 88].includes(n)) || (ci > 0 && n === 10);
      const isNew = ci === 0 && n >= clinic.patients - 3;
      // Exactly one new Central patient is created today (halfway through the local
      // day so far); the other two are 26 h / 50 h old. Everyone else: last 12 months.
      const dayStart = localToUtc(todays[ci]!, 0, clinic.timezone).getTime();
      const createdAt = isNew
        ? new Date(
            [
              dayStart + Math.floor((now.getTime() - dayStart) / 2),
              now.getTime() - 26 * HOUR,
              now.getTime() - 50 * HOUR,
            ][n - (clinic.patients - 3)]!,
          )
        : new Date(now.getTime() - (2 + int(363)) * DAY);
      const preference = random();
      const row: PatientRow = {
        id: fid('2', ci * 1000 + n + 1),
        clinicId: clinic.id,
        code: `P-${String(n + 1).padStart(3, '0')}`,
        firstName,
        lastName,
        firstNameI18n: nameI18n(firstName),
        lastNameI18n: nameI18n(lastName),
        searchText: buildSearchText([
          firstName,
          nameI18n(firstName),
          lastName,
          nameI18n(lastName),
          `P-${String(n + 1).padStart(3, '0')}`,
          phone,
          `${email}@example.com`,
        ]),
        dateOfBirth: new Date(Date.UTC(1938 + int(84), int(12), 1 + int(28))),
        phone,
        email: `${email}@example.com`,
        gender,
        address:
          random() < 0.7
            ? ci === 0
              ? `Villa ${1 + int(90)}, ${pick(['Jumeirah 1', 'Al Barsha', 'Dubai Marina', 'Downtown Dubai', 'Al Quoz'])}, Dubai, UAE`
              : ci === 1
                ? `${1 + int(120)} ${pick(['Rue de Marseille', 'Avenue de Carthage', 'Rue de Palestine'])}, Tunis, Tunisia`
                : `${1 + int(90)} ${pick(['Rue Oberkampf', 'Rue Monge', 'Avenue Daumesnil'])}, Paris, France`
            : null,
        status: archived ? 'ARCHIVED' : 'ACTIVE',
        archivedAt: archived ? new Date(now.getTime() - (10 + int(60)) * DAY) : null,
        clinicalNotes: random() < 0.3 ? pick(CLINICAL_NOTES) : null,
        adminNotes: random() < 0.25 ? pick(ADMIN_NOTES) : null,
        contactPreference: preference < 0.55 ? 'SMS' : preference < 0.85 ? 'EMAIL' : 'PHONE',
        createdAt,
      };
      patientRows.push(row);
      patientsByClinic[ci]!.push(row);
    }
  });

  // ---- appointments: place on each doctor's free grid, no overlaps
  const planned: PlannedAppointment[] = [];
  for (const doctor of DOCTORS) {
    const ci = doctor.clinic;
    const clinic = CLINICS[ci]!;
    const today = todays[ci]!;
    const rows = hourRows.filter((r) => r.doctorId === doctor.id);
    const roomId = roomIdByName.get(`${ci}:${doctor.room}`)!;
    const doctorLeaves = LEAVES.filter((l) => l.doctorId === doctor.id);
    const nowMinute = localMinuteOfDay(now, clinic.timezone);
    void nowMinute;

    // Next two working days (relative to today in the clinic zone) get the uneven demo load.
    const specialOffsets: number[] = [];
    if (ci === 0) {
      for (let o = 1; o <= 7 && specialOffsets.length < 2; o += 1) {
        if (weekdayOf(addDays(today, o)) !== 6) specialOffsets.push(o);
      }
    }
    for (let offset = -60; offset <= 14; offset += 1) {
      if (doctorLeaves.some((l) => offset >= l.from && offset <= l.to)) continue;
      const date = addDays(today, offset);
      const intervals = freeIntervals(rows, weekdayOf(date));
      const freeMinutes = intervals.reduce((sum, [s, e]) => sum + (e - s), 0);
      if (freeMinutes === 0) continue;

      let base: number;
      if (ci === 0) base = offset === 0 ? 11 + int(3) : pick([1, 2, 2, 2]);
      else base = offset === 0 ? pick([5, 6, 7]) : pick([0, 1, 1]);
      if (base === 0) continue;
      const target = Math.max(1, Math.round((base * freeMinutes) / 480));

      const placed: Array<[number, number, AppointmentType]> = [];
      const special = ci === 0 && specialOffsets.includes(offset);
      const lockedStarts = new Set<number>();
      if (special) {
        // Smart-scheduling demo: deliberately uneven days (runs, idle gaps, pinned slots).
        const dayIndex = specialOffsets.indexOf(offset);
        const doctorIndex = DOCTORS.filter((d) => d.clinic === 0).indexOf(doctor);
        const pattern = DEMO_PATTERNS[(doctorIndex + dayIndex * 2) % 4]!;
        const open = intervals[0]![0];
        for (const [rel, type, locked] of pattern) {
          const start = open + rel;
          const end = start + DURATIONS[type];
          const fits = intervals.some(([is, ie]) => start >= is && end <= ie);
          if (!fits || placed.some(([ps, pe]) => start < pe && ps < end)) continue;
          placed.push([start, end, type]);
          if (locked) lockedStarts.add(start);
        }
      }
      for (let attempt = 0; !special && attempt < 500 && placed.length < target; attempt += 1) {
        const roll = random();
        const type: AppointmentType =
          roll < 0.6 ? 'CONSULTATION' : roll < 0.9 ? 'FOLLOW_UP' : 'EMERGENCY';
        const duration = DURATIONS[type];
        let cursor = int(freeMinutes);
        let interval = intervals[0]!;
        for (const candidate of intervals) {
          const length = candidate[1] - candidate[0];
          if (cursor < length) {
            interval = candidate;
            break;
          }
          cursor -= length;
        }
        const slots = Math.floor((interval[1] - duration - interval[0]) / 15) + 1;
        if (slots <= 0) continue;
        const start = interval[0] + 15 * int(slots);
        const end = start + duration;
        if (placed.some(([ps, pe]) => start < pe && ps < end)) continue;
        placed.push([start, end, type]);
      }

      for (const [start, end, type] of placed) {
        const startsAt = localToUtc(date, start, clinic.timezone);
        const endsAt = localToUtc(date, end, clinic.timezone);
        let status: AppointmentStatus;
        let cancelReason: string | null = null;
        const roll = random();
        if (endsAt.getTime() <= now.getTime()) {
          if (roll < 0.05) status = 'NO_SHOW';
          else if (roll < 0.11) status = 'CANCELLED';
          else status = 'COMPLETED';
        } else if (startsAt.getTime() <= now.getTime()) {
          status = 'IN_PROGRESS';
        } else if (offset === 0) {
          const untilStart = (startsAt.getTime() - now.getTime()) / MINUTE;
          if (untilStart <= 25 && roll < 0.75) status = 'CHECKED_IN';
          else if (roll > 0.96) status = 'CANCELLED';
          else status = roll < 0.6 ? 'CONFIRMED' : 'SCHEDULED';
        } else {
          status = roll < (offset <= 2 ? 0.7 : 0.4) ? 'CONFIRMED' : 'SCHEDULED';
        }
        if (status === 'CANCELLED') cancelReason = pick(CANCEL_REASONS);

        planned.push({
          clinic: ci,
          doctorId: doctor.id,
          roomId,
          startsAt,
          endsAt,
          type,
          status,
          cancelReason,
          dayOffset: offset,
          patientId: '',
          reason: pick(REASONS[type]),
          id: '',
          code: '',
          createdAt: new Date(
            Math.min(startsAt.getTime() - (1 + int(21)) * DAY, now.getTime() - HOUR),
          ),
          updatedAt: new Date(0),
          locked: lockedStarts.has(start),
        });
      }
    }
  }

  // ---- explicit updatedAt (dashboards count cancellations by updatedAt)
  let centralCancelledToday = 0;
  for (const a of planned) {
    const start = a.startsAt.getTime();
    let updated: number;
    if (a.status === 'CANCELLED') {
      updated = start - (2 + int(5)) * HOUR;
      if (a.clinic === 0 && a.dayOffset === 0) {
        centralCancelledToday += 1;
        // Only the first two stay "cancelled today"; the rest were cancelled yesterday.
        if (centralCancelledToday > 2) updated = start - 20 * HOUR;
      }
    } else if (a.status === 'COMPLETED') updated = a.endsAt.getTime();
    else if (a.status === 'NO_SHOW') updated = start;
    else if (a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS')
      updated = Math.min(start, now.getTime());
    else updated = a.createdAt.getTime();
    a.updatedAt = new Date(Math.min(updated, now.getTime() - MINUTE));
  }

  // ---- assign codes, ids and patients per clinic in startsAt order
  const busy = new Map<string, Array<[number, number]>>();
  CLINICS.forEach((_clinic, ci) => {
    const list = planned
      .filter((a) => a.clinic === ci)
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() || a.doctorId.localeCompare(b.doctorId),
      );
    const pool = patientsByClinic[ci]!.filter(
      (p, n) => p.status === 'ACTIVE' && !(ci === 0 && n >= patientsByClinic[0]!.length - 3),
    );
    let todaySeen = 0;
    list.forEach((appt, i) => {
      appt.id = fid('3', ci * 10000 + i + 1);
      appt.code = `AP-${1001 + i}`;
      let patient = pool[int(pool.length)]!;
      if (ci === 0 && appt.dayOffset === 0) {
        // Make the mockup patients visible on today's Central schedule.
        if (todaySeen % 8 === 0 && todaySeen / 8 < MOCKUP_PATIENTS.length) {
          patient =
            pool.find((p) => p.code === `P-${String(todaySeen / 8 + 1).padStart(3, '0')}`) ??
            patient;
        }
        todaySeen += 1;
      }
      for (let tries = 0; tries < 15; tries += 1) {
        const slots = busy.get(patient.id) ?? [];
        const s = appt.startsAt.getTime();
        const e = appt.endsAt.getTime();
        if (!slots.some(([bs, be]) => s < be && bs < e)) break;
        patient = pool[int(pool.length)]!;
      }
      const slots = busy.get(patient.id) ?? [];
      slots.push([appt.startsAt.getTime(), appt.endsAt.getTime()]);
      busy.set(patient.id, slots);
      appt.patientId = patient.id;
    });
  });

  // ---- queue entries (Central, today)
  const central = CLINICS[0]!;
  const todayCentral = planned
    .filter((a) => a.clinic === 0 && a.dayOffset === 0)
    .filter((a) => ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'].includes(a.status));
  const queueDrafts = todayCentral
    .map((a) => ({
      appt: a,
      checkedInAt: new Date(
        Math.min(a.startsAt.getTime() - (5 + int(11)) * MINUTE, now.getTime() - MINUTE),
      ),
    }))
    .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime());
  let urgentAssigned = false;
  const queueRows = queueDrafts.map(({ appt, checkedInAt }, i) => {
    const waiting = appt.status === 'CHECKED_IN';
    const inProgress = appt.status === 'IN_PROGRESS';
    let priority: 'NORMAL' | 'URGENT' = 'NORMAL';
    if (!urgentAssigned && (waiting || inProgress) && (waiting || queueDrafts.length < 3)) {
      priority = 'URGENT';
      urgentAssigned = true;
    }
    return {
      id: fid('5', i + 1),
      clinicId: central.id,
      appointmentId: appt.id,
      patientId: appt.patientId,
      roomId: appt.roomId,
      number: `A${String(i + 1).padStart(3, '0')}`,
      priority,
      status: (waiting ? 'WAITING' : inProgress ? 'IN_CONSULTATION' : 'COMPLETED') as
        'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'NO_SHOW',
      source: i % 5 === 4 ? 'QR' : 'DESK',
      checkedInAt,
      calledAt: waiting ? null : appt.startsAt,
      startedAt: waiting ? null : appt.startsAt,
      completedAt: appt.status === 'COMPLETED' ? appt.endsAt : null,
      delayMinutes: waiting ? pick([0, 0, 5, 10]) : 0,
    };
  });

  // Past Central days: COMPLETED / NO_SHOW queue history with a gentle wait wave.
  const clampWait = (v: number): number => Math.min(25, Math.max(2, v));
  const pastCentral = planned.filter(
    (a) =>
      a.clinic === 0 && a.dayOffset < 0 && (a.status === 'COMPLETED' || a.status === 'NO_SHOW'),
  );
  const byDay = new Map<number, PlannedAppointment[]>();
  for (const a of pastCentral) byDay.set(a.dayOffset, [...(byDay.get(a.dayOffset) ?? []), a]);
  let pastSeq = 1000;
  for (const [dayOffset, list] of [...byDay.entries()].sort((x, y) => x[0] - y[0])) {
    const drafts = list
      .map((a) => ({
        appt: a,
        checkedInAt: new Date(a.startsAt.getTime() - (3 + int(13)) * MINUTE),
        wait: clampWait(Math.round(12 + 4 * Math.sin(dayOffset * 0.7) + int(9) - 4)),
      }))
      .sort((x, y) => x.checkedInAt.getTime() - y.checkedInAt.getTime());
    drafts.forEach(({ appt, checkedInAt, wait }, i) => {
      const noShow = appt.status === 'NO_SHOW';
      const calledAt = new Date(appt.startsAt.getTime() + wait * MINUTE);
      queueRows.push({
        id: fid('5', ++pastSeq),
        clinicId: central.id,
        appointmentId: appt.id,
        patientId: appt.patientId,
        roomId: appt.roomId,
        number: `A${String(i + 1).padStart(3, '0')}`,
        priority: 'NORMAL',
        status: noShow ? ('NO_SHOW' as const) : ('COMPLETED' as const),
        source: i % 5 === 4 ? 'QR' : 'DESK',
        checkedInAt,
        calledAt: noShow ? null : calledAt,
        startedAt: noShow ? null : calledAt,
        completedAt: noShow
          ? null
          : new Date(calledAt.getTime() + (appt.endsAt.getTime() - appt.startsAt.getTime())),
        delayMinutes: 0,
      });
    });
  }

  // ---- reminder deliveries for upcoming appointments
  const reminderRows: Array<{
    id: string;
    appointmentId: string;
    channel: string;
    offsetMinutes: number;
    scheduledFor: Date;
    status: 'PENDING' | 'SENT' | 'FAILED';
    attempts: number;
    sentAt: Date | null;
    error: string | null;
  }> = [];
  let reminderSeq = 1;
  let failed = 0;
  let dueCentralEmails = 0;
  const reminderFrom = now.getTime() - 6 * DAY;
  for (const appt of planned) {
    if (appt.startsAt.getTime() < reminderFrom) continue;
    if (appt.status === 'CANCELLED') continue;
    for (const offsetMinutes of [1440, 120]) {
      for (const channel of ['SMS', 'EMAIL']) {
        const scheduledFor = new Date(appt.startsAt.getTime() - offsetMinutes * MINUTE);
        const due = scheduledFor.getTime() <= now.getTime();
        let status: 'PENDING' | 'SENT' | 'FAILED' = due ? 'SENT' : 'PENDING';
        if (due && channel === 'EMAIL' && appt.clinic === 0) {
          dueCentralEmails += 1;
          if (dueCentralEmails % 37 === 5 && failed < 3) {
            status = 'FAILED';
            failed += 1;
          }
        }
        reminderRows.push({
          id: fid('7', reminderSeq++),
          appointmentId: appt.id,
          channel,
          offsetMinutes,
          scheduledFor,
          status,
          attempts: status === 'PENDING' ? 0 : status === 'FAILED' ? 3 : 1,
          sentAt:
            status === 'SENT'
              ? new Date(Math.min(scheduledFor.getTime() + (1 + int(2)) * MINUTE, now.getTime()))
              : null,
          error: status === 'FAILED' ? 'Mock provider timeout' : null,
        });
      }
    }
  }

  // ---- notifications (Central)
  const patientName = new Map(patientRows.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctorName = new Map(DOCTORS.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));
  const roomName = new Map(roomRows.map((r) => [r.id, r.name]));
  const centralAppts = planned.filter((a) => a.clinic === 0);
  const todayAppts = centralAppts.filter((a) => a.dayOffset === 0);
  const apptAt = (i: number): PlannedAppointment => {
    const source = todayAppts.length > 0 ? todayAppts : centralAppts;
    return source[(i * 7) % source.length]!;
  };
  const cancelled = centralAppts.find((a) => a.status === 'CANCELLED') ?? apptAt(5);
  const newestPatient = patientsByClinic[0]![patientsByClinic[0]!.length - 1]!;
  const apptParams = (a: PlannedAppointment, minutes: number): Prisma.InputJsonObject => ({
    patient: patientName.get(a.patientId) ?? '',
    doctor: doctorName.get(a.doctorId) ?? '',
    // ISO like the live API: the UI formats it in the clinic time zone and locale.
    time: a.startsAt.toISOString(),
    room: roomName.get(a.roomId) ?? '',
    code: a.code,
    minutes,
  });
  const delayed = queueRows.find((q) => q.status === 'WAITING');
  const notificationDrafts: Array<{
    category: string;
    key: string;
    ago: number;
    entityType: string;
    entityId: string;
    params: Prisma.InputJsonObject;
  }> = [
    {
      category: 'CONFLICT',
      key: 'conflict',
      ago: 5 * MINUTE,
      entityType: 'appointment',
      entityId: apptAt(0).id,
      params: apptParams(apptAt(0), 0),
    },
    {
      category: 'CONFIRMATION',
      key: 'confirmation',
      ago: 12 * MINUTE,
      entityType: 'appointment',
      entityId: apptAt(1).id,
      params: apptParams(apptAt(1), 0),
    },
    delayed
      ? {
          category: 'DELAY',
          key: 'delay',
          ago: 25 * MINUTE,
          entityType: 'queue',
          entityId: delayed.id,
          params: {
            ...apptParams(
              todayCentral.find((a) => a.id === delayed.appointmentId) ?? apptAt(2),
              15,
            ),
            number: delayed.number,
          },
        }
      : {
          category: 'DELAY',
          key: 'delay',
          ago: 25 * MINUTE,
          entityType: 'appointment',
          entityId: apptAt(2).id,
          params: apptParams(apptAt(2), 15),
        },
    {
      category: 'SYSTEM',
      key: 'newPatient',
      ago: HOUR,
      entityType: 'patient',
      entityId: newestPatient.id,
      params: {
        patient: `${newestPatient.firstName} ${newestPatient.lastName}`,
        code: newestPatient.code,
        doctor: '',
        time: '',
        room: '',
        minutes: 0,
      },
    },
    {
      category: 'AVAILABILITY',
      key: 'availability',
      ago: 2 * HOUR,
      entityType: 'doctor',
      entityId: DOCTORS[1]!.id,
      params: {
        patient: '',
        doctor: doctorName.get(DOCTORS[1]!.id) ?? '',
        time: '',
        room: roomName.get(roomIdByName.get('0:Room 2')!) ?? '',
        minutes: 0,
      },
    },
    {
      category: 'REMINDER',
      key: 'reminder',
      ago: 3 * HOUR,
      entityType: 'appointment',
      entityId: apptAt(3).id,
      params: apptParams(apptAt(3), 120),
    },
    {
      category: 'CANCELLATION',
      key: 'cancellation',
      ago: 5 * HOUR,
      entityType: 'appointment',
      entityId: cancelled.id,
      params: apptParams(cancelled, 0),
    },
    {
      category: 'CONFIRMATION',
      key: 'confirmation',
      ago: 26 * HOUR,
      entityType: 'appointment',
      entityId: apptAt(4).id,
      params: apptParams(apptAt(4), 0),
    },
  ];
  const staffIds = DEV_USERS.map((u) => userIds[u.email]!).filter(Boolean);
  const notificationRows = notificationDrafts.map((n, i) => ({
    id: fid('6', i + 1),
    clinicId: central.id,
    userId: null,
    category: n.category,
    titleKey: `notifications.templates.${n.key}.title`,
    bodyKey: `notifications.templates.${n.key}.body`,
    params: n.params,
    entityType: n.entityType,
    entityId: n.entityId,
    dedupeKey: `seed:${i + 1}`,
    readBy: i < 3 ? [] : staffIds,
    createdAt: new Date(now.getTime() - n.ago),
  }));

  // ---- clinic settings
  const specialtiesOf = (ci: number): string[] => [
    ...new Set(DOCTORS.filter((d) => d.clinic === ci).map((d) => d.specialty)),
  ];
  const settingsRows = CLINICS.map((clinic, ci) => {
    const openDays = ci === 0 ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
    return {
      id: fid('a', ci + 1),
      clinicId: clinic.id,
      contactEmail: clinic.email,
      phone: clinic.phone,
      defaultLanguage: ci === 2 ? 'fr' : 'en',
      cancellationNoticeHours: 2,
      requireCancelReason: true,
      targetWaitMinutes: 15,
      slotMinutes: 15,
      durations: { ...DURATIONS },
      reminderOffsets: [1440, 120],
      reminderChannels: ['SMS', 'EMAIL'],
      openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        open: 480,
        close: 1080,
        closed: !openDays.includes(weekday),
      })),
      departments: specialtiesOf(ci).map((name) => ({
        id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
        name,
        specialties: [name],
      })),
      appearance: { density: 'comfortable', highContrast: false, reduceMotion: false },
    };
  });

  // ---- chat (Central "Front desk")
  const conversationId = fid('8', 1);
  const chatScript: Array<[string, string, number]> = [
    [
      'receptionist@riaya.local',
      'Good morning team, the waiting room is already filling up.',
      6 * HOUR,
    ],
    [
      'clinic.admin@riaya.local',
      'Morning! Dr. Wilson starts at 10:00 today, please keep that in mind when checking patients in.',
      5.5 * HOUR,
    ],
    [
      'receptionist@riaya.local',
      'Noted. Two patients asked to move their visit to tomorrow.',
      4 * HOUR,
    ],
    ['doctor@riaya.local', 'Fine by me, I have room tomorrow afternoon.', 3.5 * HOUR],
    [
      'admin@riaya.local',
      'Reminder: reminder delivery stats are on the dashboard if you need them.',
      90 * MINUTE,
    ],
    ['receptionist@riaya.local', 'Thanks. Room 3 is free again if anyone needs it.', 20 * MINUTE],
  ];

  // ---- write everything
  await prisma.$transaction(
    async (tx) => {
      const clinicIds = CLINICS.map((c) => c.id);
      await tx.chatMessage.deleteMany({ where: { conversation: { clinicId: { in: clinicIds } } } });
      await tx.chatConversation.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.notification.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.reminderDelivery.deleteMany({
        where: { appointment: { clinicId: { in: clinicIds } } },
      });
      await tx.queueEntry.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.optimizationRun.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.appointment.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.workingHour.deleteMany({ where: { doctor: { clinicId: { in: clinicIds } } } });
      await tx.doctorLeave.deleteMany({ where: { doctor: { clinicId: { in: clinicIds } } } });
      await tx.doctor.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.room.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.patient.deleteMany({ where: { clinicId: { in: clinicIds } } });
      await tx.clinicSettings.deleteMany({ where: { clinicId: { in: clinicIds } } });

      await tx.clinicSettings.createMany({ data: settingsRows });
      await tx.room.createMany({ data: roomRows });
      await tx.doctor.createMany({ data: doctorRows });
      await tx.workingHour.createMany({ data: hourRows });
      await tx.doctorLeave.createMany({ data: leaveRows });
      await tx.patient.createMany({ data: patientRows });
      await tx.appointment.createMany({
        data: planned.map((a) => ({
          id: a.id,
          clinicId: CLINICS[a.clinic]!.id,
          code: a.code,
          patientId: a.patientId,
          doctorId: a.doctorId,
          roomId: a.roomId,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          status: a.status,
          type: a.type,
          reason: a.reason,
          cancelReason: a.cancelReason,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          locked: a.locked,
        })),
      });
      await tx.queueEntry.createMany({ data: queueRows });
      await tx.reminderDelivery.createMany({ data: reminderRows });
      await tx.notification.createMany({ data: notificationRows });
      await tx.chatConversation.create({
        data: {
          id: conversationId,
          clinicId: central.id,
          title: 'Front desk',
          isGroup: true,
          memberIds: staffIds,
        },
      });
      await tx.chatMessage.createMany({
        data: chatScript.map(([email, body, ago], i) => ({
          id: fid('9', i + 1),
          conversationId,
          senderId: userIds[email]!,
          body,
          readBy: i < 4 ? staffIds : [userIds[email]!],
          createdAt: new Date(now.getTime() - ago),
        })),
      });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  void organizationId;
}

export interface SeedOptions {
  /**
   * The hosted demo re-seeds itself daily (DemoController, DEMO_MODE=true) so
   * "today" always has a live schedule. Only that path may skip the local guard.
   */
  demoReset?: boolean;
  quiet?: boolean;
}

/** Fictional demo patient for the portal (ADR 0005): verified, AI consent given, onboarded. */
export const DEMO_PATIENT = { email: 'patient@riaya.local', password: 'RiayaPatient123!' };

async function seedDemoPatientAccount(clinicId: string): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: { clinicId, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  if (!patient) return;
  const now = new Date();
  const existing = await prisma.patientAccount.findFirst({
    where: { clinicId, email: DEMO_PATIENT.email },
  });
  if (existing) await prisma.patientAccount.delete({ where: { id: existing.id } });
  await prisma.patientAccount.create({
    data: {
      clinicId,
      patientId: patient.id,
      email: DEMO_PATIENT.email,
      passwordHash: await argon2.hash(DEMO_PATIENT.password),
      preferredLocale: 'en',
      emailVerifiedAt: now,
      aiConsentAt: now,
      privacyAcceptedAt: now,
      onboardingCompletedAt: now,
    },
  });
}

export async function runSeed(client: PrismaClient, options: SeedOptions = {}): Promise<void> {
  prisma = client;
  assertLocalEnvironment(options);
  const log = options.quiet ? () => undefined : console.log.bind(console);

  try {
    await prisma.$connect();
  } catch (error) {
    console.error(
      'Database connection failed. Start PostgreSQL and confirm DATABASE_URL/DB_* settings are valid before running the seed script.',
    );
    throw error;
  }

  // Tenancy baseline: every dev user becomes a member of the primary clinic so
  // the existing logins keep working. Idempotent: re-running reuses the rows.
  const organization = await prisma.organization.upsert({
    where: { slug: 'riaya-demo' },
    update: {},
    create: { name: "RI'AYA Demo Organization", slug: 'riaya-demo' },
  });

  for (const clinic of CLINICS) {
    await prisma.clinic.upsert({
      where: { id: clinic.id },
      update: {
        name: clinic.name,
        nameI18n: clinicNameI18n(clinic.name),
        timezone: clinic.timezone,
        currency: clinic.currency,
        address: clinic.address,
      },
      create: {
        id: clinic.id,
        organizationId: organization.id,
        name: clinic.name,
        nameI18n: clinicNameI18n(clinic.name),
        timezone: clinic.timezone,
        currency: clinic.currency,
        address: clinic.address,
      },
    });
  }
  const primaryClinicId = CLINICS[0]!.id;

  const userIds: Record<string, string> = {};
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
          firstNameI18n: nameI18n(item.firstName),
          lastNameI18n: nameI18n(item.lastName),
          preferredLocale: 'en',
          isActive: true,
        },
      }));
    userIds[item.email] = user.id;
    if (existing) {
      // Idempotent: existing dev users gain the per-language spellings too.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstNameI18n: nameI18n(item.firstName),
          lastNameI18n: nameI18n(item.lastName),
        },
      });
    }

    if (existing) {
      log(`skip ${item.email} (exists)`);
    } else {
      log(`created ${item.role} ${item.email}`);
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

  // Clinical fixtures: deleted and recreated for the three demo clinics.
  await seedClinicalData(organization.id, userIds);
  // Recreated after the clinical data because portal accounts cascade with patients.
  await seedDemoPatientAccount(primaryClinicId);

  log('\nDev accounts (local only):');
  for (const item of DEV_USERS) {
    log(`  ${item.role.padEnd(14)} ${item.email} / ${item.password}`);
  }
  log(`  ${'PATIENT'.padEnd(14)} ${DEMO_PATIENT.email} / ${DEMO_PATIENT.password} (portal)`);
  const [clinicCount, doctorCount, patientCount, appointmentCount, queueCount] = await Promise.all([
    prisma.clinic.count(),
    prisma.doctor.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.queueEntry.count(),
  ]);
  log('\nClinical dataset:');
  log(`  clinics      ${clinicCount}`);
  log(`  doctors      ${doctorCount}`);
  log(`  patients     ${patientCount}`);
  log(`  appointments ${appointmentCount}`);
  log(`  queue        ${queueCount}`);
  log(`\nWorkspace: ${organization.name} / ${CLINICS[0]!.name} (${primaryClinicId})`);
}

if (require.main === module) {
  loadEnv();
  const client = new PrismaClient();
  runSeed(client)
    .then(() => client.$disconnect())
    .catch(async (error: unknown) => {
      console.error('Seed failed:', error instanceof Error ? error.message : error);
      await client.$disconnect();
      process.exit(1);
    });
}
