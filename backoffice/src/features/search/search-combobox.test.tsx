import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchCombobox, type SearchComboboxLabels, type SearchOption } from './SearchCombobox';

const labels: SearchComboboxLabels = {
  input: 'Search patients and appointments',
  placeholder: 'Search…',
  empty: 'Nothing found',
  error: 'Search failed',
  loading: 'Loading',
  groups: { patient: 'Patients', appointment: 'Appointments' },
};

const options: SearchOption[] = [
  {
    id: 'p1',
    kind: 'patient',
    title: 'Sarah Johnson',
    subtitle: 'P-001',
    label: 'Patient: Sarah Johnson',
  },
  { id: 'p2', kind: 'patient', title: 'Sara Lee', subtitle: 'P-002', label: 'Patient: Sara Lee' },
  {
    id: 'a1',
    kind: 'appointment',
    title: 'AP-101 · Sarah Johnson',
    subtitle: 'Dr. Carter',
    label: 'Appointment: AP-101',
  },
];

function Harness({
  onSelect,
  items = options,
}: {
  onSelect: (o: SearchOption) => void;
  items?: SearchOption[];
}) {
  const [query, setQuery] = useState('sar');
  return (
    <SearchCombobox
      query={query}
      onQueryChange={setQuery}
      options={items}
      loading={false}
      failed={false}
      labels={labels}
      onSelect={onSelect}
    />
  );
}

afterEach(cleanup);

describe('SearchCombobox keyboard navigation', () => {
  it('moves the active option with the arrow keys and wraps around', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: labels.input });

    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const first = screen.getByRole('option', { name: 'Patient: Sarah Johnson' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Patient: Sara Lee' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(first).toHaveAttribute('aria-selected', 'true'); // wrapped past the last option

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('option', { name: 'Appointment: AP-101' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the active option on Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(options[2]);
  });

  it('closes on Escape without selecting, then clears on a second Escape', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole('combobox');

    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('announces an empty result list', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={vi.fn()} items={[]} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByText('Nothing found').length).toBeGreaterThan(0);
  });
});
