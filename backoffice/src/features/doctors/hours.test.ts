import type { WorkingInterval } from '@riaya/shared';
import {
  isOwnProfile,
  minutesToTime,
  timeToMinutes,
  validateIntervals,
  weekdayOrder,
  zonedInstant,
} from './hours';

const work = (weekday: number, s: string, e: string): WorkingInterval => ({
  weekday,
  kind: 'WORK',
  startMinute: timeToMinutes(s),
  endMinute: timeToMinutes(e),
});
const brk = (weekday: number, s: string, e: string): WorkingInterval => ({
  ...work(weekday, s, e),
  kind: 'BREAK',
});

describe('validateIntervals', () => {
  it('accepts clean hours with a break inside', () => {
    expect(
      validateIntervals([
        work(1, '08:00', '12:00'),
        work(1, '13:00', '17:00'),
        brk(1, '10:00', '10:30'),
      ]),
    ).toEqual([]);
  });

  it('flags start at or after end', () => {
    expect(validateIntervals([work(1, '09:00', '09:00')])).toEqual([
      { weekday: 1, code: 'START_AFTER_END', index: 0 },
    ]);
    expect(validateIntervals([work(2, '17:00', '08:00')])[0]?.code).toBe('START_AFTER_END');
  });

  it('flags overlapping work intervals on the same day only', () => {
    const issues = validateIntervals([
      work(1, '08:00', '12:00'),
      work(1, '11:00', '15:00'),
      work(2, '08:00', '12:00'),
    ]);
    expect(issues).toEqual([{ weekday: 1, code: 'OVERLAP', index: 1 }]);
  });

  it('allows touching intervals', () => {
    expect(validateIntervals([work(1, '08:00', '12:00'), work(1, '12:00', '16:00')])).toEqual([]);
  });

  it('flags overlapping breaks', () => {
    const issues = validateIntervals([
      work(1, '08:00', '17:00'),
      brk(1, '10:00', '11:00'),
      brk(1, '10:30', '11:30'),
    ]);
    expect(issues).toEqual([{ weekday: 1, code: 'OVERLAP', index: 2 }]);
  });

  it('flags a break outside work, or spanning two work intervals', () => {
    expect(validateIntervals([work(1, '08:00', '12:00'), brk(1, '12:00', '12:30')])[0]?.code).toBe(
      'BREAK_OUTSIDE_WORK',
    );
    expect(validateIntervals([brk(3, '10:00', '10:30')])[0]?.code).toBe('BREAK_OUTSIDE_WORK');
    expect(
      validateIntervals([
        work(1, '08:00', '12:00'),
        work(1, '13:00', '17:00'),
        brk(1, '11:30', '13:30'),
      ])[0]?.code,
    ).toBe('BREAK_OUTSIDE_WORK');
  });

  it('treats an empty time input as invalid', () => {
    const empty: WorkingInterval = {
      weekday: 1,
      kind: 'WORK',
      startMinute: Number.NaN,
      endMinute: 600,
    };
    expect(validateIntervals([empty])[0]?.code).toBe('START_AFTER_END');
  });
});

describe('time helpers', () => {
  it('round-trips HH:MM', () => {
    expect(minutesToTime(timeToMinutes('08:05'))).toBe('08:05');
    expect(timeToMinutes('')).toBeNaN();
    expect(minutesToTime(Number.NaN)).toBe('');
  });

  it('converts a clinic-local time to a UTC instant', () => {
    expect(zonedInstant('2026-11-06', 9 * 60, 'Asia/Dubai')).toBe('2026-11-06T05:00:00.000Z');
    expect(zonedInstant('2026-11-06', 0, 'UTC')).toBe('2026-11-06T00:00:00.000Z');
  });

  it('orders the week per language', () => {
    expect(weekdayOrder('en')[0]).toBe(0);
    expect(weekdayOrder('fr')[0]).toBe(1);
    expect(weekdayOrder('ar')[0]).toBe(6);
  });

  it('recognises the own profile of a doctor only', () => {
    const doctor = { firstName: 'Sarah', lastName: 'Ahmed' };
    expect(isOwnProfile({ role: 'DOCTOR', firstName: 'sarah', lastName: 'Ahmed' }, doctor)).toBe(
      true,
    );
    expect(
      isOwnProfile({ role: 'RECEPTIONIST', firstName: 'Sarah', lastName: 'Ahmed' }, doctor),
    ).toBe(false);
    expect(isOwnProfile(null, doctor)).toBe(false);
  });
});
