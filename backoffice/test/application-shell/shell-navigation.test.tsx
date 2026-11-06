import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * TEST-061 → AC-001, TEST-062 → AC-002, TEST-063 → AC-003, TEST-064 → AC-004.
 *
 * jsdom renders the responsive classes without applying breakpoints; these
 * tests assert the state, roles and accessible names the shell produces.
 */

const mocks = {
  user: {
    id: 'u1',
    email: 'amina@riaya.local',
    firstName: 'Amina',
    lastName: 'Ben',
    role: 'SUPER_ADMIN',
    preferredLocale: 'en',
    isActive: true,
    lastLoginAt: null,
  },
  active: {
    membershipId: 'm1',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c1',
    clinicName: 'Bright Clinic',
    clinicTimezone: 'UTC',
    role: 'SUPER_ADMIN',
  },
  memberships: [] as unknown[],
  logout: jest.fn(),
};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    sessionMessage: null,
    setSessionMessage: jest.fn(),
    login: jest.fn(),
    logout: mocks.logout,
  }),
}));

jest.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: mocks.memberships,
    active: mocks.active,
    loading: false,
    switching: false,
    switchTo: jest.fn(),
  }),
}));

import '../../src/i18n';
jest.mock('../../src/features/notifications/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
jest.mock('../../src/features/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));
jest.mock('../../src/features/chat/ChatLauncher', () => ({ ChatLauncher: () => null }));
jest.mock('../../src/features/booking/BookingWizard', () => ({ BookingWizard: () => null }));
jest.mock('../../src/features/search/GlobalSearch', () => ({
  GlobalSearch: () => <input role="combobox" aria-label="Search patients and appointments" />,
}));

import { AppShell } from '../../src/layouts/AppShell';

function renderShell(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.user.role = 'SUPER_ADMIN';
});

afterEach(cleanup);

describe('Shell navigation', () => {
  it('AC-001: the desktop sidebar collapses, persists and restores its state', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();

    const toggle = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(window.localStorage.getItem('riaya.sidebar.collapsed')).toBe('1');
    expect(screen.queryByText('Patients')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    unmount();
    renderShell();

    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('riaya.sidebar.collapsed')).toBe('1');
  });

  it('AC-002: the active route is marked with aria-current and a non-colour cue', () => {
    renderShell('/patients');

    const link = screen.getByRole('link', { name: 'Patients' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.className).toContain('font-semibold');

    const bar = link.querySelector('[aria-hidden="true"]');
    expect(bar, 'active item needs a non-colour cue').not.toBeNull();
  });

  it('AC-003: the mobile drawer closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    renderShell();

    const opener = screen.getByRole('button', { name: /open menu/i });
    await user.click(opener);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('AC-004: navigation shows only the destinations the role may reach', () => {
    mocks.user.role = 'DOCTOR';
    const { unmount } = renderShell();
    expect(screen.getByRole('link', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /doctors & staff/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /design system/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    unmount();

    mocks.user.role = 'CLINIC_ADMIN';
    renderShell();
    expect(screen.getByRole('link', { name: /doctors & staff/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });
});
