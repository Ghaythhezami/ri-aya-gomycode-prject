import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { offsetsProblems, openingHoursProblems } from './settings-rules';
import { UpdateSettingsDto } from './settings.dto';

const errors = (input: object) =>
  validateSync(plainToInstance(UpdateSettingsDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

const week = (patch: Partial<{ open: number; close: number; closed: boolean }> = {}) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open: 480,
    close: 1020,
    closed: false,
    ...patch,
  }));

describe('settings validation', () => {
  it('accepts a valid update', () => {
    expect(
      errors({
        targetWaitMinutes: 20,
        slotMinutes: 10,
        cancellationNoticeHours: 4,
        reminderOffsets: [1440, 120],
        clinic: { timezone: 'Asia/Dubai', currency: 'AED', name: 'Central' },
        durations: { CONSULTATION: 30 },
        openingHours: week(),
        departments: [{ name: 'Cardiology', specialties: ['Cardiology'] }],
      }),
    ).toHaveLength(0);
  });

  it.each([
    [{ targetWaitMinutes: 0 }],
    [{ targetWaitMinutes: 241 }],
    [{ slotMinutes: 25 }],
    [{ cancellationNoticeHours: 73 }],
    [{ durations: { CONSULTATION: 4 } }],
    [{ durations: { CONSULTATION: 241 } }],
    [{ reminderOffsets: [10] }],
    [{ reminderOffsets: [20000] }],
    [{ reminderOffsets: [30, 60, 90, 120, 150] }],
    [{ clinic: { timezone: 'Mars/Olympus' } }],
    [{ departments: [{ name: '', specialties: [] }] }],
    [{ openingHours: week().slice(0, 3) }],
    [{ unknownField: 1 }],
  ])('rejects %j', (input) => {
    expect(errors(input).length).toBeGreaterThan(0);
  });

  it('checks opening hours cross-field rules', () => {
    expect(openingHoursProblems(week())).toEqual([]);
    expect(openingHoursProblems(week({ open: 600, close: 600 }))).not.toEqual([]);
    expect(openingHoursProblems(week({ open: 600, close: 600, closed: true }))).toEqual([]);
    expect(offsetsProblems([60, 60])).not.toEqual([]);
  });
});
