/**
 * Schedule optimiser (SMT-2, SMT-3). Pure and deterministic: the same input gives the
 * same output (no clock, no randomness; `now` is a parameter).
 *
 * Greedy local search. Up to MAX_PASSES passes; in each pass every movable appointment
 * (ordered by start, then code) is moved to the single best strictly-improving candidate.
 * A candidate keeps the appointment on the same local day, on the slot grid inside the
 * target doctor's availability, not in the past, within `maxShiftMinutes` of its original
 * start and overlapping nothing. Targets are the same doctor or one with the same specialty.
 * Conflicting movable appointments (double-booked or outside availability) are repaired first.
 */
import type { DayMetricsTotals, OptimizationObjective } from '@riaya/shared';
import type { Interval } from '../core/availability';
import { computeDayMetrics, doctorMetrics, MINUTE_MS, waitsForDoctor } from './metrics';

export const MAX_PASSES = 3;
export const IMPROVEMENT_EPSILON = 0.01;
export const IDLE_DOCTOR_FREE_MINUTES = 60;

export interface OptDoctor {
  id: string;
  specialty: string;
  available: Interval[];
}

export interface OptAppointment {
  id: string;
  code: string;
  doctorId: string;
  start: number;
  end: number;
  status: string;
  type: string;
  locked: boolean;
}

export interface OptimizerInput {
  doctors: OptDoctor[];
  appointments: OptAppointment[];
  objective: OptimizationObjective;
  now: number;
  slotMinutes: number;
  maxShiftMinutes?: number;
  /** [dayStart, dayEnd) of the local day, epoch ms. */
  dayStart: number;
  dayEnd: number;
}

export interface OptMove {
  appointmentId: string;
  code: string;
  fromDoctorId: string;
  toDoctorId: string;
  fromStart: number;
  toStart: number;
  durationMinutes: number;
  reasonKey: string;
}

export interface OptimizerResult {
  moves: OptMove[];
  before: DayMetricsTotals;
  after: DayMetricsTotals;
  unresolved: { appointmentId: string; code: string; reasonKey: string }[];
  idleDoctors: { doctorId: string; freeMinutes: number }[];
  status: 'IMPROVED' | 'NO_IMPROVEMENT';
  /** The schedule after the moves (every appointment passed in). */
  appointments: OptAppointment[];
}

export const MOVABLE_STATUSES = ['SCHEDULED', 'CONFIRMED'];

export function isMovable(a: OptAppointment, now: number): boolean {
  return (
    MOVABLE_STATUSES.includes(a.status) && a.type !== 'EMERGENCY' && !a.locked && a.start > now
  );
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function insideAvailability(start: number, end: number, available: Interval[]): boolean {
  return available.some((i) => start >= i.start && end <= i.end);
}

/** Per-doctor contribution to the objective (lower is better; utilisation is a percentage). */
function doctorValue(
  objective: OptimizationObjective,
  doctor: OptDoctor,
  list: { start: number; end: number }[],
): number {
  if (objective === 'MIN_WAIT') return waitsForDoctor(list).reduce((a, b) => a + b, 0);
  const d = doctorMetrics({ id: doctor.id, available: doctor.available }, list);
  if (objective === 'REDUCE_GAPS') return d.idleGapMinutes;
  return d.availableMinutes > 0 ? (d.bookedMinutes / d.availableMinutes) * 100 : Number.NaN;
}

function combine(
  objective: OptimizationObjective,
  doctors: OptDoctor[],
  value: (doctorId: string) => number,
): number {
  if (objective !== 'MAX_UTILISATION') {
    return doctors.reduce((sum, d) => sum + value(d.id), 0);
  }
  const bySpecialty = new Map<string, number[]>();
  for (const d of doctors) {
    const v = value(d.id);
    if (Number.isNaN(v)) continue;
    const list = bySpecialty.get(d.specialty) ?? [];
    list.push(v);
    bySpecialty.set(d.specialty, list);
  }
  let total = 0;
  for (const values of bySpecialty.values()) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    total += values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }
  return total;
}

function groupByDoctor(appointments: OptAppointment[]): Map<string, OptAppointment[]> {
  const map = new Map<string, OptAppointment[]>();
  for (const a of appointments) {
    const list = map.get(a.doctorId) ?? [];
    list.push(a);
    map.set(a.doctorId, list);
  }
  return map;
}

/** Objective value of a schedule (lower is better). Exported for the property tests. */
export function objectiveValue(
  objective: OptimizationObjective,
  doctors: OptDoctor[],
  appointments: OptAppointment[],
): number {
  const grouped = groupByDoctor(appointments);
  const values = new Map(
    doctors.map((d) => [d.id, doctorValue(objective, d, grouped.get(d.id) ?? [])]),
  );
  return combine(objective, doctors, (id) => values.get(id) ?? 0);
}

interface Candidate {
  doctorId: string;
  start: number;
  score: number;
  shift: number;
  sameDoctor: boolean;
}

/** True when `a` beats `b`: score, then smaller shift, same doctor, doctor id, earlier start. */
function better(a: Candidate, b: Candidate): boolean {
  if (Math.abs(a.score - b.score) > 1e-9) return a.score < b.score;
  if (a.shift !== b.shift) return a.shift < b.shift;
  if (a.sameDoctor !== b.sameDoctor) return a.sameDoctor;
  if (a.doctorId !== b.doctorId) return a.doctorId < b.doctorId;
  return a.start < b.start;
}

function isConflicting(
  a: OptAppointment,
  doctor: OptDoctor | undefined,
  siblings: OptAppointment[],
): boolean {
  if (!doctor) return false;
  if (!insideAvailability(a.start, a.end, doctor.available)) return true;
  return siblings.some((s) => s.id !== a.id && overlap(a.start, a.end, s.start, s.end));
}

function byStartThenCode(x: OptAppointment, y: OptAppointment): number {
  if (x.start !== y.start) return x.start - y.start;
  return x.code < y.code ? -1 : x.code > y.code ? 1 : 0;
}

export function optimize(input: OptimizerInput): OptimizerResult {
  const maxShift = (input.maxShiftMinutes ?? 120) * MINUTE_MS;
  const slot = input.slotMinutes * MINUTE_MS;
  const doctors = [...input.doctors].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const doctorById = new Map(doctors.map((d) => [d.id, d]));
  const state: OptAppointment[] = input.appointments
    .filter((a) => doctorById.has(a.doctorId))
    .map((a) => ({ ...a }));
  const original = new Map(state.map((a) => [a.id, { doctorId: a.doctorId, start: a.start }]));
  const toMetric = (list: OptAppointment[]) =>
    list.map((a) => ({ doctorId: a.doctorId, start: a.start, end: a.end }));
  const before = computeDayMetrics('', doctors, toMetric(state)).totals;

  /** Best candidate for `a`; without `requireImprovement` any valid target qualifies. */
  const findBest = (a: OptAppointment, requireImprovement: boolean): Candidate | null => {
    const source = doctorById.get(a.doctorId)!;
    const duration = a.end - a.start;
    const grouped = groupByDoctor(state);
    const base = new Map(
      doctors.map((d) => [d.id, doctorValue(input.objective, d, grouped.get(d.id) ?? [])]),
    );
    const baseScore = combine(input.objective, doctors, (id) => base.get(id)!);
    const origin = original.get(a.id)!;
    const sourceRest = (grouped.get(source.id) ?? []).filter((o) => o.id !== a.id);
    let best: Candidate | null = null;
    for (const target of doctors) {
      if (target.specialty !== source.specialty) continue;
      const others = (grouped.get(target.id) ?? []).filter((o) => o.id !== a.id);
      for (const interval of target.available) {
        for (let start = interval.start; start + duration <= interval.end; start += slot) {
          const end = start + duration;
          if (start < input.now || start < input.dayStart || end > input.dayEnd) continue;
          if (Math.abs(start - origin.start) > maxShift) continue;
          if (target.id === a.doctorId && start === a.start) continue;
          if (others.some((o) => overlap(start, end, o.start, o.end))) continue;
          const moved = { start, end };
          const overrides = new Map<string, number>();
          if (target.id === source.id) {
            overrides.set(target.id, doctorValue(input.objective, target, [...sourceRest, moved]));
          } else {
            overrides.set(source.id, doctorValue(input.objective, source, sourceRest));
            overrides.set(target.id, doctorValue(input.objective, target, [...others, moved]));
          }
          const score = combine(
            input.objective,
            doctors,
            (id) => overrides.get(id) ?? base.get(id)!,
          );
          if (requireImprovement && baseScore - score <= IMPROVEMENT_EPSILON) continue;
          const candidate: Candidate = {
            doctorId: target.id,
            start,
            score,
            shift: Math.abs(start - a.start),
            sameDoctor: target.id === a.doctorId,
          };
          if (!best || better(candidate, best)) best = candidate;
        }
      }
    }
    return best;
  };

  const apply = (a: OptAppointment, c: Candidate) => {
    const duration = a.end - a.start;
    a.doctorId = c.doctorId;
    a.start = c.start;
    a.end = c.start + duration;
  };

  const movableOrdered = () => state.filter((s) => isMovable(s, input.now)).sort(byStartThenCode);

  // 1. Repair the conflicts that can be repaired.
  for (const a of movableOrdered()) {
    const siblings = state.filter((s) => s.doctorId === a.doctorId);
    if (!isConflicting(a, doctorById.get(a.doctorId), siblings)) continue;
    const best = findBest(a, false);
    if (best) apply(a, best);
  }

  // 2. Greedy improvement passes.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const a of movableOrdered()) {
      const best = findBest(a, true);
      if (best) {
        apply(a, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const moves: OptMove[] = [];
  for (const a of [...state].sort(byStartThenCode)) {
    const from = original.get(a.id)!;
    if (from.doctorId === a.doctorId && from.start === a.start) continue;
    moves.push({
      appointmentId: a.id,
      code: a.code,
      fromDoctorId: from.doctorId,
      toDoctorId: a.doctorId,
      fromStart: from.start,
      toStart: a.start,
      durationMinutes: Math.round((a.end - a.start) / MINUTE_MS),
      reasonKey: `scheduling.reasons.${input.objective}`,
    });
  }
  moves.sort((x, y) => x.fromStart - y.fromStart || (x.code < y.code ? -1 : 1));

  const grouped = groupByDoctor(state);
  const unresolved = [...state]
    .sort(byStartThenCode)
    .filter((a) => isConflicting(a, doctorById.get(a.doctorId), grouped.get(a.doctorId) ?? []))
    .map((a) => ({ appointmentId: a.id, code: a.code, reasonKey: 'scheduling.reasons.noSlot' }));

  const afterMetrics = computeDayMetrics('', doctors, toMetric(state));
  const idleDoctors = afterMetrics.perDoctor
    .filter((d) => d.freeMinutes >= IDLE_DOCTOR_FREE_MINUTES)
    .map((d) => ({ doctorId: d.doctorId, freeMinutes: d.freeMinutes }));

  return {
    moves,
    before,
    after: afterMetrics.totals,
    unresolved,
    idleDoctors,
    status: moves.length > 0 ? 'IMPROVED' : 'NO_IMPROVEMENT',
    appointments: state,
  };
}
