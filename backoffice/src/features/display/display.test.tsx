import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicDisplay } from '@riaya/shared';
import i18n from '../../i18n';
import { DisplayBoard } from './PublicDisplayPage';
import { SelfCheckInView } from './SelfCheckInPage';
import { selfCheckInErrorKey, selfCheckInSchema } from './selfCheckIn';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('public display', () => {
  it('renders numbers and rooms and never a patient name', () => {
    // A hostile payload that carries names must still not leak them to the screen.
    const payload = {
      clinicName: 'Central Clinic',
      nowServing: [{ number: 'A010', room: 'Room 2', patientName: 'Sarah Johnson' }],
      waiting: [{ number: 'A011', patient: { name: 'Michael Brown' } }, { number: 'A012' }],
      updatedAt: '2026-11-06T10:00:00.000Z',
    } as unknown as PublicDisplay;
    const { container } = render(
      <DisplayBoard data={payload} lost={false} now={new Date('2026-11-06T10:00:00Z')} />,
    );
    expect(screen.getByText('Central Clinic')).toBeInTheDocument();
    expect(screen.getByText('A010')).toBeInTheDocument();
    expect(screen.getByText('Room 2')).toBeInTheDocument();
    expect(screen.getByText('A011')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Sarah|Johnson|Michael|Brown/);
  });

  it('shows a connection-lost banner', () => {
    render(<DisplayBoard data={null} lost now={new Date()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/connection lost/i);
  });
});

describe('self check-in', () => {
  it('normalises the code and requires 4 digits', () => {
    expect(
      selfCheckInSchema.safeParse({ appointmentCode: ' ap-1042 ', phoneLast4: '1447' }),
    ).toMatchObject({
      success: true,
      data: { appointmentCode: 'AP-1042', phoneLast4: '1447' },
    });
    expect(
      selfCheckInSchema.safeParse({ appointmentCode: 'AP-1042', phoneLast4: '14' }).success,
    ).toBe(false);
    expect(
      selfCheckInSchema.safeParse({ appointmentCode: '1042', phoneLast4: '1447' }).success,
    ).toBe(false);
    expect(selfCheckInSchema.safeParse({ appointmentCode: '', phoneLast4: '1447' }).success).toBe(
      false,
    );
  });

  it('maps API failures to generic messages', () => {
    expect(selfCheckInErrorKey(404, 'CHECK_IN_NOT_FOUND')).toBe('display.checkIn.notFound');
    expect(selfCheckInErrorKey(429, '')).toBe('display.checkIn.rateLimited');
    expect(selfCheckInErrorKey(500, 'X')).toBe('display.checkIn.failed');
  });

  it('shows field errors and blocks submit until valid', async () => {
    const onSubmit = jest.fn();
    render(
      <SelfCheckInView
        onSubmit={onSubmit}
        result={null}
        error={null}
        busy={false}
        onReset={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('Enter your appointment code.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Appointment code/), 'ap-1042');
    await userEvent.type(screen.getByLabelText(/Last 4 digits/), '1447');
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ appointmentCode: 'AP-1042', phoneLast4: '1447' });
  });

  it('shows the queue number and position on success', () => {
    render(
      <SelfCheckInView
        onSubmit={() => undefined}
        result={{ number: 'A015', position: 3 }}
        error={null}
        busy={false}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText('A015')).toBeInTheDocument();
    expect(screen.getByText(/ahead of you: 3/)).toBeInTheDocument();
  });
});
