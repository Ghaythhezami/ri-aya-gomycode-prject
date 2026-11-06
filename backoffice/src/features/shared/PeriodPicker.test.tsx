import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { PeriodPicker } from './PeriodPicker';
import {
  MAX_PERIOD_DAYS,
  detectPreset,
  isValidPeriod,
  monthEnd,
  periodError,
  periodRange,
  shiftPeriod,
  weekStartFor,
  weekStartOf,
} from './period';

// 2026-11-06 is a Friday.
const TODAY = '2026-11-06';

describe('period math', () => {
  it('starts the week on Monday by default and on any configured day', () => {
    expect(weekStartOf(TODAY)).toBe('2026-11-02');
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02');
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02');
    expect(weekStartOf(TODAY, 0)).toBe('2026-11-01');
    expect(weekStartOf(TODAY, 6)).toBe('2026-10-31');
    expect(weekStartFor('ar')).toBe(1);
    expect(weekStartFor('fr-FR')).toBe(1);
    expect(weekStartFor(undefined)).toBe(1);
  });

  it('builds every preset', () => {
    expect(periodRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(periodRange('thisWeek', TODAY)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(periodRange('nextWeek', TODAY)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(periodRange('thisMonth', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('last30', TODAY)).toEqual({ from: '2026-10-08', to: TODAY });
    const custom = { from: '2026-01-01', to: '2026-01-10' };
    expect(periodRange('custom', TODAY, 1, custom)).toEqual(custom);
  });

  it('knows month bounds, including leap years and December', () => {
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-12-31')).toBe('2026-12-31');
    expect(periodRange('thisMonth', '2026-12-15')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('shifts by the period length, across month and year boundaries', () => {
    expect(shiftPeriod({ from: TODAY, to: TODAY }, 1)).toEqual({
      from: '2026-11-07',
      to: '2026-11-07',
    });
    expect(shiftPeriod({ from: '2026-11-02', to: '2026-11-08' }, -1)).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
    expect(shiftPeriod({ from: '2026-12-28', to: '2027-01-03' }, 1)).toEqual({
      from: '2027-01-04',
      to: '2027-01-10',
    });
  });

  it('detects the preset of a range', () => {
    expect(detectPreset(periodRange('nextWeek', TODAY), TODAY)).toBe('nextWeek');
    expect(detectPreset({ from: '2026-11-03', to: '2026-11-04' }, TODAY)).toBe('custom');
  });

  it('caps a period at 92 days', () => {
    expect(MAX_PERIOD_DAYS).toBe(92);
    expect(periodError({ from: '2026-01-01', to: '2026-04-02' })).toBeNull(); // 92 days
    expect(periodError({ from: '2026-01-01', to: '2026-04-03' })).toBe('tooLong'); // 93 days
    expect(periodError({ from: '2026-11-08', to: '2026-11-02' })).toBe('order');
    expect(periodError({ from: '', to: TODAY })).toBe('invalid');
    expect(isValidPeriod({ from: TODAY, to: TODAY })).toBe(true);
  });
});

describe('PeriodPicker', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  const setup = () => {
    const onChange = jest.fn();
    render(
      <PeriodPicker
        value={{ from: TODAY, to: TODAY }}
        onChange={onChange}
        today={TODAY}
        locale="en"
      />,
    );
    return onChange;
  };

  it('picks a preset', () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText('Period', { selector: 'select' }), {
      target: { value: 'thisWeek' },
    });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('shifts with the arrows', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-11-07', to: '2026-11-07' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-11-05', to: '2026-11-05' });
  });

  it('shows an inline error and does not apply a custom range over 92 days', () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText('Period', { selector: 'select' }), {
      target: { value: 'custom' },
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('at most 92 days');
    expect(onChange).not.toHaveBeenCalled();
  });
});
