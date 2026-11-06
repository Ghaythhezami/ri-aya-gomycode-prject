import {
  changeInfo,
  filenameFromDisposition,
  isValidRange,
  presetRange,
  previousPeriod,
  signed,
} from './ranges';

describe('analytics ranges', () => {
  it('computes preset ranges', () => {
    expect(presetRange('last7', '2026-03-10')).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(presetRange('month', '2026-03-10')).toEqual({ from: '2026-03-01', to: '2026-03-10' });
  });
  it('computes the previous period of equal length', () => {
    expect(previousPeriod({ from: '2026-03-04', to: '2026-03-10' })).toEqual({
      from: '2026-02-25',
      to: '2026-03-03',
    });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });
  it('validates custom ranges', () => {
    expect(isValidRange({ from: '2026-03-02', to: '2026-03-01' })).toBe(false);
    expect(isValidRange({ from: '2024-01-01', to: '2026-01-01' })).toBe(false);
    expect(isValidRange({ from: '2026-03-01', to: '2026-03-01' })).toBe(true);
  });
  it('judges change direction', () => {
    expect(changeInfo(-1.2, true)).toEqual({ direction: 'down', good: true });
    expect(changeInfo(4, true)).toEqual({ direction: 'up', good: false });
    expect(changeInfo(0).good).toBeNull();
    expect(signed(-1.2, '1.2')).toBe('−1.2');
  });
  it('reads export filenames', () => {
    expect(filenameFromDisposition('attachment; filename="a.csv"', 'x')).toBe('a.csv');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%C3%A9.csv", 'x')).toBe('ré.csv');
    expect(filenameFromDisposition(undefined, 'x')).toBe('x');
  });
});
