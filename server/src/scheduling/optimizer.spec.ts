import type { OptimizationObjective } from '@riaya/shared';
import {
  insideAvailability,
  isMovable,
  objectiveValue,
  optimize,
  type OptAppointment,
  type OptDoctor,
  type OptimizerInput,
} from './optimizer';

const M = 60_000;
const DAY_START = Date.UTC(2026, 10, 6, 0, 0); // treat UTC midnight as the local day start
const DAY_END = DAY_START + 24 * 60 * M;
const at = (minuteOfDay: number) => DAY_START + minuteOfDay * M;

/** mulberry32: small deterministic PRNG. */
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

const OBJECTIVES: OptimizationObjective[] = ['MIN_WAIT', 'REDUCE_GAPS', 'MAX_UTILISATION'];
const STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];
const TYPES = ['CONSULTATION', 'FOLLOW_UP', 'EMERGENCY'];

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

describe('optimizer properties over 240 random days', () => {
  const seeds = Array.from({ length: 240 }, (_, i) => i + 1);

  it('never overlaps, never leaves availability, never moves protected appointments', () => {
    for (const seed of seeds) {
      const input = randomDay(seed);
      const result = optimize(input);
      const byId = new Map(input.appointments.map((a) => [a.id, a]));
      const doctors = new Map(input.doctors.map((d) => [d.id, d]));
      for (const move of result.moves) {
        const original = byId.get(move.appointmentId)!;
        expect(isMovable(original, input.now)).toBe(true);
        expect(['EMERGENCY', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']).not.toContain(
          original.status === 'SCHEDULED' || original.status === 'CONFIRMED'
            ? original.type
            : original.status,
        );
        expect(original.locked).toBe(false);
        expect(move.toStart).toBeGreaterThanOrEqual(input.now);
        expect(Math.abs(move.toStart - move.fromStart)).toBeLessThanOrEqual(120 * M);
        expect(doctors.get(move.toDoctorId)!.specialty).toBe(
          doctors.get(move.fromDoctorId)!.specialty,
        );
      }
      for (const a of result.appointments) {
        const doctor = doctors.get(a.doctorId)!;
        expect(insideAvailability(a.start, a.end, doctor.available)).toBe(true);
        for (const b of result.appointments) {
          if (a.id === b.id || a.doctorId !== b.doctorId) continue;
          expect(a.start < b.end && b.start < a.end).toBe(false);
        }
        const original = byId.get(a.id)!;
        if (!isMovable(original, input.now)) {
          expect(a.start).toBe(original.start);
          expect(a.doctorId).toBe(original.doctorId);
        }
      }
      expect(result.unresolved).toEqual([]);
    }
  });

  it('is deterministic', () => {
    for (const seed of seeds) {
      const input = randomDay(seed);
      expect(optimize(input)).toEqual(optimize(input));
    }
  });

  it('never makes its own objective worse', () => {
    let improved = 0;
    for (const seed of seeds) {
      const input = randomDay(seed);
      const result = optimize(input);
      const before = objectiveValue(input.objective, input.doctors, input.appointments);
      const after = objectiveValue(input.objective, input.doctors, result.appointments);
      expect(after).toBeLessThanOrEqual(before + 1e-6);
      if (result.moves.length > 0) improved++;
      expect(result.status).toBe(result.moves.length > 0 ? 'IMPROVED' : 'NO_IMPROVEMENT');
    }
    expect(improved).toBeGreaterThan(10);
  });
});

describe('optimizer benchmark day', () => {
  const doctors: OptDoctor[] = [
    { id: 'a', specialty: 'GP', available: [{ start: at(540), end: at(720) }] },
    { id: 'b', specialty: 'GP', available: [{ start: at(540), end: at(720) }] },
  ];
  const appointments: OptAppointment[] = Array.from({ length: 6 }, (_, i) => ({
    id: `x${i}`,
    code: `AP-${i}`,
    doctorId: 'a',
    start: at(540 + i * 30),
    end: at(570 + i * 30),
    status: 'SCHEDULED',
    type: 'CONSULTATION',
    locked: false,
  }));

  it('MIN_WAIT measurably lowers the estimated average wait', () => {
    const result = optimize({
      doctors,
      appointments,
      objective: 'MIN_WAIT',
      now: at(360),
      slotMinutes: 15,
      dayStart: DAY_START,
      dayEnd: DAY_END,
    });
    expect(result.status).toBe('IMPROVED');
    expect(result.before.estimatedWaitMinutes).toBeGreaterThan(8);
    expect(result.after.estimatedWaitMinutes).toBeLessThan(result.before.estimatedWaitMinutes - 3);
    expect(result.moves.some((m) => m.toDoctorId === 'b')).toBe(true);
    expect(result.moves[0]!.reasonKey).toBe('scheduling.reasons.MIN_WAIT');
    expect(result.idleDoctors.length).toBeLessThanOrEqual(2);
  });

  it('MAX_UTILISATION balances load onto the idle doctor', () => {
    const result = optimize({
      doctors,
      appointments,
      objective: 'MAX_UTILISATION',
      now: at(360),
      slotMinutes: 15,
      dayStart: DAY_START,
      dayEnd: DAY_END,
    });
    expect(result.moves.length).toBeGreaterThan(0);
  });

  it('reports conflicts it cannot fix as unresolved', () => {
    const result = optimize({
      doctors: [doctors[0]!],
      appointments: [
        { ...appointments[0]!, id: 'p', status: 'IN_PROGRESS' },
        { ...appointments[0]!, id: 'q', code: 'AP-Q', status: 'CHECKED_IN' },
      ],
      objective: 'MIN_WAIT',
      now: at(360),
      slotMinutes: 15,
      dayStart: DAY_START,
      dayEnd: DAY_END,
    });
    expect(result.unresolved.map((u) => u.appointmentId)).toEqual(['p', 'q']);
    expect(result.unresolved[0]!.reasonKey).toBe('scheduling.reasons.noSlot');
  });
});
