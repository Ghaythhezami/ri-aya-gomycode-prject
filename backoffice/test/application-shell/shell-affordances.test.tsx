import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** TEST-067 → AC-007 (bell/chat), TEST-068 → AC-008 (search placeholder). */

const mocks = vi.hoisted(() => ({
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
}));

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    sessionMessage: null,
    setSessionMessage: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: mocks.memberships,
    active: mocks.active,
    loading: false,
    switching: false,
    switchTo: vi.fn(),
  }),
}));

vi.mock('../../src/features/notifications/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('../../src/features/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));
vi.mock('../../src/features/chat/ChatLauncher', () => ({ ChatLauncher: () => null }));
vi.mock('../../src/features/booking/BookingWizard', () => ({ BookingWizard: () => null }));
vi.mock('../../src/features/search/GlobalSearch', () => ({
  GlobalSearch: () => <input role="combobox" aria-label="Search patients and appointments" />,
}));

import i18n from '../../src/i18n';
import { AppShell } from '../../src/layouts/AppShell';

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('Shell future affordances', () => {
  it('AC-007/008: the global search is a live combobox and the bell/chat are owned by their features', () => {
    renderShell();
    const search = screen.getByRole('combobox', { name: 'Search patients and appointments' });
    expect(search).toBeEnabled();
    expect(document.getElementById('shell-coming-soon')).toBeNull();
  });
});
