import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** TEST-065 → AC-005 (breadcrumbs), TEST-066 → AC-006 (active clinic). */

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
  } as { role: string; firstName: string; lastName: string },
  active: {
    membershipId: 'm1',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c1',
    clinicName: 'Bright Clinic',
    clinicTimezone: 'UTC',
    role: 'SUPER_ADMIN',
  } as null | Record<string, string>,
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

import '../../src/i18n';
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
  mocks.active = {
    membershipId: 'm1',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c1',
    clinicName: 'Bright Clinic',
    clinicTimezone: 'UTC',
    role: 'SUPER_ADMIN',
  };
});

afterEach(cleanup);

describe('Shell context', () => {
  it('AC-005: breadcrumbs show Overview plus the section and mark the last crumb', () => {
    renderShell('/patients');

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    const current = within(nav).getByText('Patients');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Patients' })).not.toBeInTheDocument();
  });

  it('AC-005: the overview route marks Overview as the current crumb', () => {
    renderShell('/');

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByText('Overview')).toHaveAttribute('aria-current', 'page');
  });

  it('AC-005: an unknown route falls back to Overview', () => {
    renderShell('/not-a-real-route');

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
    expect(within(nav).getByText('Overview')).toHaveAttribute('aria-current', 'page');
  });

  it('AC-006: the shell shows the active clinic and organization, never a literal', () => {
    renderShell('/');

    expect(screen.getAllByText('Bright Clinic').length).toBeGreaterThan(0);
    expect(screen.getByText('Bright Org')).toBeInTheDocument();
    expect(screen.queryByText('Central Clinic')).not.toBeInTheDocument();
    expect(screen.getByTitle('Bright Clinic — Bright Org')).toBeInTheDocument();
  });

  it('AC-006: a user with no memberships sees a neutral label', () => {
    mocks.active = null;
    renderShell('/');

    expect(screen.getByText('No clinic')).toBeInTheDocument();
    expect(screen.queryByText('Central Clinic')).not.toBeInTheDocument();
  });
});
