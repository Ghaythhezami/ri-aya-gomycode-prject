import {
  availableIntervals,
  dayRuleIntervals,
  generateSlots,
  isWithinAvailability,
  mergeIntervals,
  subtractIntervals,
  totalMinutes,
  type WorkingRule,
} from './availability';
import { localDayBounds, localToUtc, toLocalDate, zoneOffsetMinutes } from './clinic-time';

const DUBAI = 'Asia/Dubai'; // UTC+4, no DST
const PARIS = 'Europe/Paris';
const MON = '2026-11-09'; // a Monday (weekday 1)

const work = (weekday: number, startMinute: number, endMinute: number): WorkingRule => ({
  weekday,
  startMinute,
  endMinute,
  kind: 'WORK',
});
const brk = (weekday: number, startMinute: number, endMinute: number): WorkingRule => ({
  weekday,
  startMinute,
  endMinute,
  kind: 'BREAK',
});

const hhmm = (d: Date, tz = DUBAI) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return p;
};

describe('generateSlots', () => {
  it('returns nothing for empty rules', () => {
    expect(
      generateSlots({
        date: MON,
        timeZone: DUBAI,
        rules: [],
        durationMinutes: 30,
        stepMinutes: 15,
      }),
    ).toEqual([]);
  });

  it('returns nothing on a weekday without rules', () => {
    const slots = generateSlots({
      date: '2026-11-10',
      timeZone: DUBAI,
      rules: [work(1, 480, 720)],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots).toHaveLength(0);
  });

  it('cuts a 4 hour interval into 8 half hour slots', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 720)],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots).toHaveLength(8);
    expect(hhmm(slots[0]!.startsAt)).toBe('08:00');
    expect(hhmm(slots[7]!.endsAt)).toBe('12:00');
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('uses the step for spacing and the duration for length', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 600)],
      durationMinutes: 45,
      stepMinutes: 30,
    });
    // starts 08:00, 08:30, 09:00, 09:15 does not exist; last start 09:00 ends 09:45; 09:30 ends 10:15 > 10:00
    expect(slots.map((s) => hhmm(s.startsAt))).toEqual(['08:00', '08:30', '09:00']);
    expect(slots.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 45 * 60_000)).toBe(
      true,
    );
  });

  it('with a 15 minute step and 30 minute duration overlapping candidates are produced', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 600)],
      durationMinutes: 30,
      stepMinutes: 15,
    });
    expect(slots).toHaveLength(7); // 08:00 .. 09:30
  });

  it('never produces a slot overlapping a break', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 1020), brk(1, 720, 780)],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    const starts = slots.map((s) => hhmm(s.startsAt));
    expect(starts).not.toContain('12:00');
    expect(starts).not.toContain('12:30');
    expect(starts).toContain('11:30');
    expect(starts).toContain('13:00');
  });

  it('handles several work intervals in one day', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 540), work(1, 840, 900)],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots.map((s) => hhmm(s.startsAt))).toEqual(['08:00', '08:30', '14:00', '14:30']);
  });

  it('removes the part of the day covered by a leave', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 720)],
      leaves: [{ startsAt: localToUtc(MON, 600, DUBAI), endsAt: localToUtc(MON, 1000, DUBAI) }],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots.map((s) => hhmm(s.startsAt))).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });

  it('removes every slot when a leave covers the whole day', () => {
    const { start, end } = localDayBounds(MON, DUBAI);
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 1020)],
      leaves: [{ startsAt: start, endsAt: end }],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots).toEqual([]);
  });

  it('marks slots in the past unavailable', () => {
    const now = localToUtc(MON, 9 * 60 + 10, DUBAI);
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 660)],
      durationMinutes: 30,
      stepMinutes: 30,
      now,
    });
    const byStart = Object.fromEntries(slots.map((s) => [hhmm(s.startsAt), s.available]));
    expect(byStart['08:00']).toBe(false);
    expect(byStart['09:00']).toBe(false);
    expect(byStart['09:30']).toBe(true);
  });

  it('marks slots overlapping a busy range unavailable', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 600)],
      busy: [{ startsAt: localToUtc(MON, 500, DUBAI), endsAt: localToUtc(MON, 530, DUBAI) }],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    // busy 08:20-08:50 blocks 08:00 and 08:30
    expect(slots.map((s) => s.available)).toEqual([false, false, true, true]);
  });

  it('treats adjacent appointments (end == start) as NOT overlapping', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 480, 600)],
      busy: [{ startsAt: localToUtc(MON, 510, DUBAI), endsAt: localToUtc(MON, 540, DUBAI) }],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    const byStart = Object.fromEntries(slots.map((s) => [hhmm(s.startsAt), s.available]));
    expect(byStart['08:00']).toBe(true); // 08:00-08:30 ends exactly when busy starts
    expect(byStart['08:30']).toBe(false);
    expect(byStart['09:00']).toBe(true); // starts exactly when busy ends
  });

  it('reports a period for each slot', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 660, 1140)],
      durationMinutes: 60,
      stepMinutes: 60,
    });
    const period = Object.fromEntries(slots.map((s) => [hhmm(s.startsAt), s.period]));
    expect(period['11:00']).toBe('MORNING');
    expect(period['12:00']).toBe('AFTERNOON');
    expect(period['17:00']).toBe('EVENING');
  });

  it('rejects non positive duration or step', () => {
    const base = { date: MON, timeZone: DUBAI, rules: [work(1, 480, 600)] };
    expect(generateSlots({ ...base, durationMinutes: 0, stepMinutes: 15 })).toEqual([]);
    expect(generateSlots({ ...base, durationMinutes: 30, stepMinutes: 0 })).toEqual([]);
  });
});

describe('availableIntervals', () => {
  it('subtracts breaks from work', () => {
    const intervals = availableIntervals(MON, DUBAI, [work(1, 480, 1020), brk(1, 720, 780)]);
    expect(intervals).toHaveLength(2);
    expect(totalMinutes(intervals)).toBe(480);
  });

  it('keeps an overnight interval crossing midnight as one interval', () => {
    const intervals = availableIntervals(MON, DUBAI, [work(1, 22 * 60, 6 * 60)]);
    expect(intervals).toHaveLength(1);
    expect(totalMinutes(intervals)).toBe(8 * 60);
    expect(hhmm(new Date(intervals[0]!.end))).toBe('06:00');
    expect(toLocalDate(new Date(intervals[0]!.end), DUBAI)).toBe('2026-11-10');
  });

  it('generates slots across midnight for a night shift', () => {
    const slots = generateSlots({
      date: MON,
      timeZone: DUBAI,
      rules: [work(1, 23 * 60, 1 * 60)],
      durationMinutes: 30,
      stepMinutes: 30,
    });
    expect(slots.map((s) => hhmm(s.startsAt))).toEqual(['23:00', '23:30', '00:00', '00:30']);
  });

  it('treats an interval ending at 24:00 as ending at the next midnight', () => {
    const intervals = availableIntervals(MON, DUBAI, [work(1, 22 * 60, 1440)]);
    expect(totalMinutes(intervals)).toBe(120);
  });

  it('is empty for no rules', () => {
    expect(availableIntervals(MON, DUBAI, [])).toEqual([]);
  });

  it('splits work and breaks in dayRuleIntervals', () => {
    const { work: w, breaks } = dayRuleIntervals(MON, DUBAI, [
      work(1, 480, 1020),
      brk(1, 720, 780),
    ]);
    expect(w).toHaveLength(1);
    expect(breaks).toHaveLength(1);
  });
});

describe('daylight saving (Europe/Paris)', () => {
  it('spring forward 2026-03-29 has a 23 hour day', () => {
    const { start, end } = localDayBounds('2026-03-29', PARIS);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
    expect(zoneOffsetMinutes(start, PARIS)).toBe(60);
    expect(zoneOffsetMinutes(end, PARIS)).toBe(120);
  });

  it('fall back 2026-10-25 has a 25 hour day', () => {
    const { start, end } = localDayBounds('2026-10-25', PARIS);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it('a 00:00-06:00 shift is 5 real hours on the spring forward day', () => {
    const intervals = availableIntervals('2026-03-29', PARIS, [work(0, 0, 360)]);
    expect(totalMinutes(intervals)).toBe(300);
  });

  it('a 00:00-06:00 shift is 7 real hours on the fall back day', () => {
    const intervals = availableIntervals('2026-10-25', PARIS, [work(0, 0, 360)]);
    expect(totalMinutes(intervals)).toBe(420);
  });

  it('a 08:00-12:00 shift keeps 4 hours on both DST days', () => {
    expect(totalMinutes(availableIntervals('2026-03-29', PARIS, [work(0, 480, 720)]))).toBe(240);
    expect(totalMinutes(availableIntervals('2026-10-25', PARIS, [work(0, 480, 720)]))).toBe(240);
  });

  it('08:00 local is 07:00Z before and 06:00Z after the spring change', () => {
    expect(localToUtc('2026-03-28', 480, PARIS).toISOString()).toBe('2026-03-28T07:00:00.000Z');
    expect(localToUtc('2026-03-29', 480, PARIS).toISOString()).toBe('2026-03-29T06:00:00.000Z');
  });

  it('08:00 local is 06:00Z before and 07:00Z after the autumn change', () => {
    expect(localToUtc('2026-10-24', 480, PARIS).toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(localToUtc('2026-10-25', 480, PARIS).toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });

  it('a non-existent local time (02:30 on 2026-03-29) resolves forward by the gap', () => {
    expect(localToUtc('2026-03-29', 150, PARIS).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('an ambiguous local time (02:30 on 2026-10-25) resolves to the first occurrence', () => {
    expect(localToUtc('2026-10-25', 150, PARIS).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('generates the right number of slots on the 25 hour day', () => {
    const slots = generateSlots({
      date: '2026-10-25',
      timeZone: PARIS,
      rules: [work(0, 0, 360)],
      durationMinutes: 60,
      stepMinutes: 60,
    });
    expect(slots).toHaveLength(7);
  });

  it('an overnight shift across the spring change loses an hour', () => {
    const intervals = availableIntervals('2026-03-28', PARIS, [work(6, 22 * 60, 6 * 60)]);
    expect(totalMinutes(intervals)).toBe(7 * 60);
  });
});

describe('interval helpers', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 20, end: 30 },
        { start: 5, end: 8 },
        { start: 25, end: 40 },
      ]),
    ).toEqual([
      { start: 5, end: 8 },
      { start: 10, end: 40 },
    ]);
  });

  it('subtracts a cut from the middle of an interval', () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });

  it('isWithinAvailability requires the whole range inside one interval', () => {
    const available = availableIntervals(MON, DUBAI, [work(1, 480, 720), brk(1, 600, 630)]);
    const at = (a: number, b: number) => ({
      startsAt: localToUtc(MON, a, DUBAI),
      endsAt: localToUtc(MON, b, DUBAI),
    });
    expect(isWithinAvailability(at(480, 510), available)).toBe(true);
    expect(isWithinAvailability(at(590, 620), available)).toBe(false); // crosses the break
    expect(isWithinAvailability(at(700, 730), available)).toBe(false); // past closing
    expect(isWithinAvailability(at(630, 660), available)).toBe(true); // starts when the break ends
  });
});
