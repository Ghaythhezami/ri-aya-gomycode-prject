import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { QueueEntryDto } from '@riaya/shared';
import i18n from '../../i18n';
import { displayedWait, isOverTarget } from './queueLogic';
import { QueueRow } from './QueueRow';

vi.mock('../shared/format', () => ({
  useClinicFormat: () => ({ time: () => '09:30' }),
}));

const entry: QueueEntryDto = {
  id: 'q1',
  number: 'A012',
  appointmentId: 'a1',
  appointmentCode: 'AP-1012',
  patient: { id: 'p1', name: 'Aisha Khan', initials: 'AK' },
  doctor: { id: 'd1', name: 'Dr. Sarah Ahmed', initials: 'SA', specialty: 'Dermatology' },
  room: null,
  appointmentTime: '2026-11-06T06:30:00.000Z',
  checkedInAt: '2026-11-06T05:30:00.000Z',
  calledAt: null,
  startedAt: null,
  priority: 'URGENT',
  status: 'WAITING',
  source: 'DESK',
  waitingMinutes: 20,
  overTarget: true,
  delayMinutes: 0,
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function renderRow(props: Partial<Parameters<typeof QueueRow>[0]> = {}) {
  return render(
    <ul>
      <QueueRow entry={entry} waitMinutes={20} overTarget {...props} />
    </ul>,
  );
}

describe('QueueRow', () => {
  it('shows an over-target row with icon and text, not colour alone', () => {
    const { container } = renderRow();
    const label = screen.getByText('Over target');
    expect(label).toBeInTheDocument();
    expect(label.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-over-target]')).not.toBeNull();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    // "Waiting" is both the column label and the status chip text.
    expect(screen.getAllByText('Waiting')).toHaveLength(2);
  });

  it('does not flag a row within target', () => {
    renderRow({ entry: { ...entry, overTarget: false }, waitMinutes: 5, overTarget: false });
    expect(screen.queryByText('Over target')).not.toBeInTheDocument();
  });

  it('offers Start for waiting and Complete for in-consultation entries', () => {
    const noop = () => undefined;
    const first = renderRow({ onStart: noop, onComplete: noop });
    expect(screen.getByRole('button', { name: 'Start consultation' })).toBeInTheDocument();
    first.unmount();
    renderRow({ entry: { ...entry, status: 'IN_CONSULTATION' }, onStart: noop, onComplete: noop });
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start consultation' })).not.toBeInTheDocument();
  });
});

describe('queue logic', () => {
  it('ticks only while waiting', () => {
    expect(displayedWait(entry, 125_000)).toBe(22);
    expect(displayedWait({ ...entry, status: 'CALLED' }, 125_000)).toBe(20);
  });

  it('marks over target by server flag or local ticking', () => {
    expect(isOverTarget({ ...entry, overTarget: false }, 16, 15)).toBe(true);
    expect(isOverTarget({ ...entry, overTarget: false }, 10, 15)).toBe(false);
    expect(isOverTarget({ ...entry, status: 'IN_CONSULTATION' }, 40, 15)).toBe(false);
  });
});
