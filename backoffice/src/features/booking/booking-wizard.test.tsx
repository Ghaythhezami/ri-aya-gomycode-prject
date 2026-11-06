import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/** Wizard behaviour without the API: RTK Query hooks are replaced by static data. */

const mocks = (() => {
  const patients = [
    {
      id: 'p1',
      code: 'P-001',
      name: 'Sarah Johnson',
      initials: 'SJ',
      phoneMasked: '+971 50 ••• 0440',
    },
    {
      id: 'p2',
      code: 'P-002',
      name: 'Michael Brown',
      initials: 'MB',
      phoneMasked: '+971 50 ••• 0441',
    },
  ];
  const doctors = [
    {
      id: 'd1',
      name: 'Dr. Emily Carter',
      initials: 'EC',
      specialty: 'Cardiology',
      consultationMinutes: 30,
      isActive: true,
      availability: 'AVAILABLE',
      hoursLabel: '08:00–16:00',
    },
  ];
  const mutation = () => [
    jest.fn(() => ({ unwrap: () => Promise.resolve({ lockToken: 't', expiresAt: '' }) })),
    { isLoading: false },
  ];
  return { patients, doctors, mutation };
})();

jest.mock('./api', () => ({
  useBookPatientsQuery: () => ({
    data: { items: mocks.patients },
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useBookPatientQuery: () => ({ data: undefined }),
  useBookCreatePatientMutation: () => mocks.mutation(),
  useBookSpecialtiesQuery: () => ({ data: ['Cardiology'] }),
  useBookDoctorsQuery: () => ({
    data: mocks.doctors,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useBookDoctorQuery: () => ({ data: undefined }),
  useBookSlotsQuery: () => ({ data: [], isFetching: false, error: undefined, refetch: jest.fn() }),
  useBookLockMutation: () => mocks.mutation(),
  useBookUnlockMutation: () => mocks.mutation(),
  useBookCreateMutation: () => mocks.mutation(),
}));

jest.mock('../shared/api', () => ({
  useClinicReferenceQuery: () => ({
    data: { durations: { CONSULTATION: 30, FOLLOW_UP: 15, EMERGENCY: 20 }, slotMinutes: 30 },
  }),
}));

jest.mock('../shared/appointmentTypes', () => ({
  ...jest.requireActual('../shared/appointmentTypes'),
  useAppointmentTypesQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('../../auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: [],
    active: { clinicTimezone: 'UTC' },
    loading: false,
    switching: false,
    switchTo: jest.fn(),
  }),
}));

import i18n from '../../i18n';
import { BookingWizard } from './BookingWizard';
import { closeBooking, openBooking } from './booking-launcher';

function renderWizard() {
  render(
    <MemoryRouter>
      <BookingWizard />
    </MemoryRouter>,
  );
  act(() => openBooking());
}

const next = () => screen.getByRole('button', { name: i18n.t('clinic.next') });

beforeEach(async () => {
  window.sessionStorage.clear();
  await i18n.changeLanguage('en');
});

afterEach(() => {
  act(() => closeBooking());
  cleanup();
});

describe('Booking wizard', () => {
  it('shows five labelled steps and starts on the patient step', () => {
    renderWizard();
    const steps = screen.getByRole('navigation', { name: i18n.t('booking.stepsLabel') });
    expect(steps.querySelectorAll('li')).toHaveLength(5);
    for (const key of ['patient', 'doctor', 'datetime', 'details', 'review']) {
      expect(steps).toHaveTextContent(i18n.t(`booking.steps.${key}`));
    }
    expect(
      screen.getByRole('heading', { name: i18n.t('booking.patient.title') }),
    ).toBeInTheDocument();
  });

  it('blocks Next with a message until a patient is chosen', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(next());

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('booking.errors.patient'));
    expect(
      screen.getByRole('heading', { name: i18n.t('booking.patient.title') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: i18n.t('booking.doctor.title') })).toBeNull();
  });

  it('blocks Next on the doctor step until a doctor is chosen', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: /Sarah Johnson/ }));
    await user.click(next());
    expect(
      await screen.findByRole('heading', { name: i18n.t('booking.doctor.title') }),
    ).toBeInTheDocument();

    await user.click(next());
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('booking.errors.doctor'));
    expect(screen.queryByRole('heading', { name: i18n.t('booking.datetime.title') })).toBeNull();
  });

  it('keeps entered data when going Back and forward again', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: /Sarah Johnson/ }));
    await user.click(next());
    await user.click(await screen.findByRole('button', { name: /Dr\. Emily Carter/ }));

    await user.click(screen.getByRole('button', { name: i18n.t('clinic.back') }));
    expect(await screen.findByRole('button', { name: /Sarah Johnson/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(next());
    expect(await screen.findByRole('button', { name: /Dr\. Emily Carter/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores the draft from the session when reopened', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Michael Brown/ }));
    await user.click(next());
    await screen.findByRole('heading', { name: i18n.t('booking.doctor.title') });

    // Dismiss with the X (keeps the draft), then open again.
    await user.click(screen.getAllByRole('button', { name: i18n.t('clinic.close') })[1]!);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => openBooking());

    expect(
      await screen.findByRole('heading', { name: i18n.t('booking.doctor.title') }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: i18n.t('clinic.back') }));
    expect(await screen.findByRole('button', { name: /Michael Brown/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
