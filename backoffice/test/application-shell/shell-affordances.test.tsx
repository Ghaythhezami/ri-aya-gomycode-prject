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
  it('AC-007: notification and chat entry points are disabled and explained', () => {
    renderShell();

    const comingSoon = i18n.t('shell.comingSoon');
    const notifications = screen.getByRole('button', { name: 'Notifications' });
    const chat = screen.getByRole('button', { name: 'Chat' });

    for (const control of [notifications, chat]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute('aria-describedby', 'shell-coming-soon');
      expect(control).toHaveAttribute('title', comingSoon);
    }

    const note = document.getElementById('shell-coming-soon');
    expect(note?.textContent).toBe(comingSoon);
    // A disabled button cannot start a navigation.
    expect(notifications.closest('a')).toBeNull();
    expect(chat.closest('a')).toBeNull();
  });

  it('AC-008: the global search is a disabled placeholder that explains itself', () => {
    renderShell();

    const search = screen.getByPlaceholderText(i18n.t('shell.search'));
    expect(search).toBeDisabled();
    expect(search).toHaveAttribute('aria-describedby', 'shell-coming-soon');
    expect(search).toHaveAttribute('title', i18n.t('shell.comingSoon'));
    expect(search).toHaveAttribute('aria-label', i18n.t('shell.search'));
  });
});
