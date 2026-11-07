import { conflictAlternatives, isSlotConflict } from './conflict';

const err = (code: string, details?: unknown) => ({
  response: { status: 409, data: { code, message: 'x', details } },
});

describe('slot conflict helpers', () => {
  it('recognises SLOT_CONFLICT only', () => {
    expect(isSlotConflict(err('SLOT_CONFLICT'))).toBe(true);
    expect(isSlotConflict(err('VALIDATION_FAILED'))).toBe(false);
    expect(isSlotConflict(new Error('network'))).toBe(false);
  });

  it('reads alternatives from an array or an { alternatives } object', () => {
    const slot = { startsAt: '2026-03-02T09:00:00Z', endsAt: '2026-03-02T09:30:00Z' };
    expect(conflictAlternatives(err('SLOT_CONFLICT', [slot]))).toEqual([slot]);
    expect(
      conflictAlternatives(err('SLOT_CONFLICT', { alternatives: [slot, { startsAt: 'bad' }] })),
    ).toEqual([slot]);
    expect(conflictAlternatives(err('SLOT_CONFLICT'))).toEqual([]);
  });
});
