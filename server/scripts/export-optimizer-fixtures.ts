/**
 * Writes the parity fixtures shared with the Python scheduler (ADR 0003):
 * `services/scheduler/tests/fixtures/optimizer-*.json`, each `{ input, output }` where `output`
 * is what the TypeScript optimiser returns. Deterministic: no clock, no randomness at run time.
 *
 *   cd server && npx ts-node --transpile-only scripts/export-optimizer-fixtures.ts
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  optimize,
  type OptAppointment,
  type OptDoctor,
  type OptimizerInput,
} from '../src/scheduling/optimizer';

const M = 60_000;
const DAY_START = Date.UTC(2026, 10, 6, 0, 0);
const DAY_END = DAY_START + 24 * 60 * M;
const at = (minuteOfDay: number) => DAY_START + minuteOfDay * M;

const appt = (
  id: string,
  doctorId: string,
  startMin: number,
  durMin: number,
  extra: Partial<OptAppointment> = {},
): OptAppointment => ({
  id,
  code: `AP-${id}`,
  doctorId,
  start: at(startMin),
  end: at(startMin + durMin),
  status: 'SCHEDULED',
  type: 'CONSULTATION',
  locked: false,
  ...extra,
});

const gp = (id: string, ...ranges: [number, number][]): OptDoctor => ({
  id,
  specialty: 'GP',
  available: ranges.map(([s, e]) => ({ start: at(s), end: at(e) })),
});

const base = {
  now: at(360),
  slotMinutes: 15,
  dayStart: DAY_START,
  dayEnd: DAY_END,
};

const stacked = (doctorId: string, count: number) =>
  Array.from({ length: count }, (_, i) => appt(`s${i}`, doctorId, 540 + i * 30, 30));

/** mulberry32, same generator as optimizer.spec.ts. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];
const TYPES = ['CONSULTATION', 'FOLLOW_UP', 'EMERGENCY'];
const OBJECTIVES = ['MIN_WAIT', 'REDUCE_GAPS', 'MAX_UTILISATION'] as const;

function randomDay(seed: number): OptimizerInput {
  const rnd = prng(seed);
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const doctorCount = int(2, 4);
  const doctors: OptDoctor[] = [];
  for (let i = 0; i < doctorCount; i++) {
    const startH = int(7, 9) * 60;
    doctors.push({
      id: `d${i}`,
      specialty: i < 2 ? 'GP' : rnd() < 0.5 ? 'GP' : 'ENT',
      available: [
        { start: at(startH), end: at(startH + 240) },
        { start: at(startH + 300), end: at(startH + 540) },
      ],
    });
  }
  const appointments: OptAppointment[] = [];
  let n = 0;
  for (const doctor of doctors) {
    const target = int(0, 14);
    for (let k = 0; k < target; k++) {
      const duration = rnd() < 0.5 ? 15 : 30;
      const interval = doctor.available[int(0, 1)]!;
      const slots = Math.floor((interval.end - interval.start) / (15 * M));
      const start = interval.start + int(0, slots - 1) * 15 * M;
      const end = start + duration * M;
      if (end > interval.end) continue;
      if (appointments.some((a) => a.doctorId === doctor.id && start < a.end && a.start < end))
        continue;
      appointments.push({
        id: `a${n}`,
        code: `AP-${1000 + n}`,
        doctorId: doctor.id,
        start,
        end,
        status: STATUSES[int(0, STATUSES.length - 1)]!,
        type: rnd() < 0.15 ? 'EMERGENCY' : TYPES[int(0, 1)]!,
        locked: rnd() < 0.1,
      });
      n++;
    }
  }
  return {
    doctors,
    appointments,
    objective: OBJECTIVES[seed % 3]!,
    now: at(int(5, 12) * 60),
    slotMinutes: [10, 15, 30][seed % 3]!,
    dayStart: DAY_START,
    dayEnd: DAY_END,
  };
}

const fixtures: Record<string, OptimizerInput> = {
  'min-wait-two-doctors': {
    ...base,
    objective: 'MIN_WAIT',
    doctors: [gp('a', [540, 720]), gp('b', [540, 720])],
    appointments: stacked('a', 6),
  },
  'reduce-gaps': {
    ...base,
    objective: 'REDUCE_GAPS',
    doctors: [gp('a', [540, 720]), gp('b', [540, 720])],
    appointments: [
      appt('g0', 'a', 540, 30),
      appt('g1', 'a', 600, 30),
      appt('g2', 'a', 660, 30),
      appt('g3', 'b', 570, 15),
    ],
  },
  'max-utilisation': {
    ...base,
    objective: 'MAX_UTILISATION',
    doctors: [gp('a', [540, 720]), gp('b', [540, 720])],
    appointments: stacked('a', 6),
  },
  'locked-and-emergency': {
    ...base,
    objective: 'MIN_WAIT',
    doctors: [gp('a', [540, 720]), gp('b', [540, 720])],
    appointments: [
      appt('l0', 'a', 540, 30, { locked: true }),
      appt('l1', 'a', 570, 30, { type: 'EMERGENCY' }),
      appt('l2', 'a', 600, 30),
      appt('l3', 'a', 630, 30),
      appt('l4', 'a', 660, 30, { status: 'CONFIRMED' }),
    ],
  },
  'in-progress-and-past': {
    ...base,
    now: at(600),
    objective: 'REDUCE_GAPS',
    doctors: [gp('a', [480, 720]), gp('b', [480, 720])],
    appointments: [
      appt('p0', 'a', 480, 30, { status: 'COMPLETED' }),
      appt('p1', 'a', 570, 30, { status: 'IN_PROGRESS' }),
      appt('p2', 'a', 600, 30, { status: 'CHECKED_IN' }),
      appt('p3', 'a', 630, 30),
      appt('p4', 'a', 690, 15),
      appt('p5', 'b', 660, 15),
    ],
  },
  'idle-doctors': {
    ...base,
    objective: 'MIN_WAIT',
    doctors: [gp('a', [540, 720]), gp('b', [540, 720]), gp('c', [540, 600])],
    appointments: [appt('i0', 'a', 540, 30), appt('i1', 'a', 570, 30)],
  },
  'no-improvement': {
    ...base,
    objective: 'MIN_WAIT',
    doctors: [gp('a', [540, 720])],
    appointments: [appt('n0', 'a', 540, 30), appt('n1', 'a', 600, 30)],
  },
  'multi-doctor-same-specialty': {
    ...base,
    objective: 'MAX_UTILISATION',
    maxShiftMinutes: 90,
    doctors: [
      gp('d1', [540, 720], [780, 900]),
      gp('d2', [540, 720]),
      gp('d3', [600, 780]),
      { id: 'd4', specialty: 'ENT', available: [{ start: at(540), end: at(720) }] },
    ],
    appointments: [
      ...Array.from({ length: 5 }, (_, i) => appt(`m${i}`, 'd1', 540 + i * 30, 30)),
      appt('m5', 'd1', 780, 45),
      appt('m6', 'd2', 600, 15),
      appt('m7', 'd4', 540, 30),
      appt('m8', 'd4', 570, 30),
    ],
  },
  'conflicts-repair': {
    ...base,
    objective: 'MIN_WAIT',
    doctors: [gp('a', [540, 660]), gp('b', [540, 660])],
    appointments: [
      appt('c0', 'a', 540, 30),
      appt('c1', 'a', 555, 30),
      appt('c2', 'a', 700, 30),
      appt('c3', 'ghost-owner', 560, 30),
    ],
  },
  'random-seed-7': randomDay(7),
  'random-seed-20': randomDay(20),
  'random-seed-33': randomDay(33),
  'random-seed-101': randomDay(101),
};

const dir = join(__dirname, '..', '..', 'services', 'scheduler', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) {
  if (f.startsWith('optimizer-') && f.endsWith('.json')) unlinkSync(join(dir, f));
}
for (const [name, input] of Object.entries(fixtures)) {
  const output = optimize(input);
  writeFileSync(
    join(dir, `optimizer-${name}.json`),
    `${JSON.stringify({ input, output }, null, 2)}\n`,
  );
  console.log(`${name}: ${output.status}, ${output.moves.length} moves`);
}
