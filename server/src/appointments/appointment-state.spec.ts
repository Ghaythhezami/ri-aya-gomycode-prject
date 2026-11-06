import { APPOINTMENT_STATUSES, APPOINTMENT_TRANSITIONS, canTransition } from '@riaya/shared';
import type { AppointmentStatus } from '@riaya/shared';
import { ConflictException } from '@nestjs/common';
import {
  allowedTransitions,
  assertTransition,
  isEditable,
  TERMINAL_STATUSES,
} from './appointment-state';

describe('appointment state machine', () => {
  const legal: [AppointmentStatus, AppointmentStatus][] = [
    ['SCHEDULED', 'CONFIRMED'],
    ['SCHEDULED', 'CHECKED_IN'],
    ['SCHEDULED', 'CANCELLED'],
    ['SCHEDULED', 'NO_SHOW'],
    ['CONFIRMED', 'CHECKED_IN'],
    ['CONFIRMED', 'CANCELLED'],
    ['CONFIRMED', 'NO_SHOW'],
    ['CONFIRMED', 'SCHEDULED'],
    ['CHECKED_IN', 'IN_PROGRESS'],
    ['CHECKED_IN', 'NO_SHOW'],
    ['CHECKED_IN', 'CANCELLED'],
    ['IN_PROGRESS', 'COMPLETED'],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('allows exactly the listed transitions and nothing else', () => {
    for (const from of APPOINTMENT_STATUSES) {
      for (const to of APPOINTMENT_STATUSES) {
        const expected = legal.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('refuses COMPLETED -> SCHEDULED with 409 ILLEGAL_TRANSITION and details', () => {
    expect(canTransition('COMPLETED', 'SCHEDULED')).toBe(false);
    try {
      assertTransition('COMPLETED', 'SCHEDULED');
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as {
        code: string;
        details: { from: string; to: string; allowed: string[] };
      };
      expect(body.code).toBe('ILLEGAL_TRANSITION');
      expect(body.details).toEqual({ from: 'COMPLETED', to: 'SCHEDULED', allowed: [] });
    }
  });

  it('terminal states have no way out', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
      expect(allowedTransitions(status)).toEqual([]);
      expect(isEditable(status)).toBe(false);
    }
    expect(TERMINAL_STATUSES).toHaveLength(3);
  });

  it('cannot skip check-in: SCHEDULED -> IN_PROGRESS and SCHEDULED -> COMPLETED are illegal', () => {
    expect(canTransition('SCHEDULED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canTransition('CHECKED_IN', 'COMPLETED')).toBe(false);
  });

  it('allowedTransitions returns a copy of the shared table', () => {
    const copy = allowedTransitions('SCHEDULED');
    expect(copy).toEqual([...APPOINTMENT_TRANSITIONS.SCHEDULED]);
    copy.push('COMPLETED');
    expect(APPOINTMENT_TRANSITIONS.SCHEDULED).not.toContain('COMPLETED');
  });

  it('only non terminal appointments can be edited', () => {
    expect(isEditable('SCHEDULED')).toBe(true);
    expect(isEditable('IN_PROGRESS')).toBe(true);
  });
});
