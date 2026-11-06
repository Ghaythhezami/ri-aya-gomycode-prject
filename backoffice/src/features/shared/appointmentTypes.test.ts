import type { AppointmentTypeDto } from '@riaya/shared';
import {
  durationForType,
  previewEnd,
  resolveColor,
  sortTypes,
  typeFilterOptions,
  typeToken,
} from './appointmentTypes';

function type(over: Partial<AppointmentTypeDto>): AppointmentTypeDto {
  return {
    id: over.code ?? 'x',
    code: 'CONSULTATION',
    name: {},
    displayName: 'Consultation',
    durationMinutes: 30,
    color: 'primary',
    isEmergency: false,
    isActive: true,
    isSystem: true,
    sortOrder: 0,
    usageCount: 0,
    ...over,
  };
}

const TYPES = [
  type({ code: 'FOLLOW_UP', displayName: 'Follow-up', durationMinutes: 15, sortOrder: 2 }),
  type({ code: 'CONSULTATION', displayName: 'Consultation', durationMinutes: 30, sortOrder: 1 }),
  type({
    code: 'LAB_REVIEW',
    displayName: 'Lab review',
    durationMinutes: 45,
    sortOrder: 3,
    isActive: false,
    isSystem: false,
    color: 'violet',
  }),
];

describe('durationForType', () => {
  it('uses the clinic type duration', () => {
    expect(durationForType(TYPES, 'FOLLOW_UP')).toBe(15);
    expect(durationForType(TYPES, 'LAB_REVIEW')).toBe(45);
  });
  it('falls back to the system default, then the fallback', () => {
    expect(durationForType(undefined, 'EMERGENCY')).toBe(20);
    expect(durationForType([], 'CUSTOM', 25)).toBe(25);
  });
});

describe('previewEnd', () => {
  const starts = '2026-12-01T09:00:00.000Z';
  const ends = '2026-12-01T09:30:00.000Z';
  it('applies the new type duration', () => {
    expect(previewEnd(starts, ends, 45, false)).toBe('2026-12-01T09:45:00.000Z');
  });
  it('keeps the current end when keeping the duration', () => {
    expect(previewEnd(starts, ends, 45, true)).toBe(ends);
  });
});

describe('colour to token mapping', () => {
  it('maps each colour key to a design token', () => {
    expect(typeToken('primary')).toBe('var(--color-primary)');
    expect(typeToken('alert')).toBe('var(--color-alert)');
    expect(typeToken('violet')).toContain('--color-violet');
  });
  it('falls back to the system colour of the code, then primary', () => {
    expect(resolveColor(undefined, 'EMERGENCY')).toBe('alert');
    expect(resolveColor('not-a-colour', 'FOLLOW_UP')).toBe('info');
    expect(resolveColor(null, 'CUSTOM')).toBe('primary');
  });
});

describe('typeFilterOptions', () => {
  it('lists inactive types flagged, in sort order', () => {
    expect(typeFilterOptions(TYPES)).toEqual([
      { code: 'CONSULTATION', label: 'Consultation', inactive: false },
      { code: 'FOLLOW_UP', label: 'Follow-up', inactive: false },
      { code: 'LAB_REVIEW', label: 'Lab review', inactive: true },
    ]);
  });
  it('sortTypes does not mutate its input', () => {
    const copy = [...TYPES];
    sortTypes(TYPES);
    expect(TYPES).toEqual(copy);
  });
});
