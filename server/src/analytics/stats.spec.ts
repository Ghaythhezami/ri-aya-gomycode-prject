import { dateRange, pctChange, previousRange } from './stats';

describe('analytics stats', () => {
  it('computes percentage change safely', () => {
    expect(pctChange(12, 10)).toBe(20);
    expect(pctChange(5, 10)).toBe(-50);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(3, 0)).toBe(100);
  });
  it('builds the previous range of equal length', () => {
    expect(dateRange('2026-11-01', '2026-11-30')).toHaveLength(30);
    expect(previousRange('2026-11-01', '2026-11-30')).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
    expect(previousRange('2026-11-06', '2026-11-06')).toEqual({
      from: '2026-11-05',
      to: '2026-11-05',
    });
  });
});
