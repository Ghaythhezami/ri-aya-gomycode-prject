import { selectAlternatives, type CandidateSlot } from './alternatives';
import { isSerializationFailure, isSlotConflictError } from './conflict-errors';
import { KeyedMutex } from './keyed-mutex';

const base = Date.parse('2026-11-09T06:00:00.000Z');
const slot = (doctorId: string, minutesFromBase: number, name = doctorId): CandidateSlot => ({
  doctorId,
  doctorName: `Dr. ${name}`,
  startsAt: new Date(base + minutesFromBase * 60_000),
  endsAt: new Date(base + (minutesFromBase + 30) * 60_000),
  period: 'MORNING',
});

describe('selectAlternatives', () => {
  const requested = new Date(base + 60 * 60_000);

  it('orders same-doctor slots by absolute distance from the requested start', () => {
    const result = selectAlternatives({
      requestedStart: requested,
      sameDoctor: [slot('a', 0), slot('a', 30), slot('a', 90), slot('a', 150), slot('a', 240)],
      sameSpecialty: [],
    });
    expect(result.map((r) => r.startsAt)).toEqual([
      new Date(base + 30 * 60_000).toISOString(), // 30 before
      new Date(base + 90 * 60_000).toISOString(), // 30 after (tie: earlier wins)
      new Date(base + 0).toISOString(), // 60 before
    ]);
    expect(result.every((r) => r.kind === 'SAME_DOCTOR')).toBe(true);
  });

  it('returns at most three and never the requested start itself', () => {
    const result = selectAlternatives({
      requestedStart: requested,
      sameDoctor: [slot('a', 60), slot('a', 90), slot('a', 120), slot('a', 150), slot('a', 180)],
      sameSpecialty: [slot('b', 0)],
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.startsAt)).not.toContain(requested.toISOString());
  });

  it('fills from other doctors of the same specialty, earliest first', () => {
    const result = selectAlternatives({
      requestedStart: requested,
      sameDoctor: [slot('a', 90)],
      sameSpecialty: [slot('c', 200, 'c'), slot('b', 30, 'b'), slot('b', 100, 'b')],
    });
    expect(result.map((r) => [r.doctorId, r.kind])).toEqual([
      ['a', 'SAME_DOCTOR'],
      ['b', 'SAME_SPECIALTY'],
      ['b', 'SAME_SPECIALTY'],
    ]);
    expect(result[1]!.startsAt).toBe(new Date(base + 30 * 60_000).toISOString());
    expect(result[2]!.startsAt).toBe(new Date(base + 100 * 60_000).toISOString());
  });

  it('does not use other doctors when the same doctor already fills three', () => {
    const result = selectAlternatives({
      requestedStart: requested,
      sameDoctor: [slot('a', 0), slot('a', 30), slot('a', 90)],
      sameSpecialty: [slot('b', 61)],
    });
    expect(result.every((r) => r.doctorId === 'a')).toBe(true);
  });

  it('returns an empty list when nothing is free', () => {
    expect(
      selectAlternatives({ requestedStart: requested, sameDoctor: [], sameSpecialty: [] }),
    ).toEqual([]);
  });

  it('removes duplicates and marks slots available', () => {
    const result = selectAlternatives({
      requestedStart: requested,
      sameDoctor: [slot('a', 90), slot('a', 90)],
      sameSpecialty: [slot('a', 90)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.available).toBe(true);
  });
});

describe('conflict error mapping', () => {
  it('recognises the exclusion constraint, 23P01 and serialization failures', () => {
    expect(isSlotConflictError({ code: 'P2034', message: 'write conflict' })).toBe(true);
    expect(isSlotConflictError({ code: '23P01' })).toBe(true);
    expect(
      isSlotConflictError({ code: 'P2010', message: 'Raw query failed', meta: { code: '23P01' } }),
    ).toBe(true);
    expect(
      isSlotConflictError(new Error('conflicting key value violates "appointments_no_overlap"')),
    ).toBe(true);
    expect(isSlotConflictError(new Error('connection refused'))).toBe(false);
    expect(isSlotConflictError(null)).toBe(false);
  });

  it('only serialization failures are retryable', () => {
    expect(isSerializationFailure({ code: 'P2034' })).toBe(true);
    expect(isSerializationFailure({ code: '23P01' })).toBe(false);
  });
});

describe('KeyedMutex', () => {
  it('runs tasks of one key one at a time, in order', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const task = (name: string, ms: number) =>
      mutex.run('doctor-1', async () => {
        order.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`end ${name}`);
      });
    await Promise.all([task('a', 20), task('b', 1), task('c', 1)]);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a failing task and runs other keys in parallel', async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.run('k', () => Promise.reject(new Error('boom')));
    await expect(failing).rejects.toThrow('boom');
    await expect(mutex.run('k', async () => 'ok')).resolves.toBe('ok');
    const order: string[] = [];
    await Promise.all([
      mutex.run('x', async () => {
        await new Promise((r) => setTimeout(r, 15));
        order.push('x');
      }),
      mutex.run('y', async () => {
        order.push('y');
      }),
    ]);
    expect(order).toEqual(['y', 'x']);
  });
});
