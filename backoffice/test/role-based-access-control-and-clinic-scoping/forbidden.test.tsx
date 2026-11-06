import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CAPABILITY_ROLES, USER_ROLES } from '@riaya/shared';

/**
 * TEST-082 → AC-001, TEST-083 → AC-002, TEST-084 → AC-003, TEST-085 → AC-004,
 * TEST-086 → AC-005, TEST-087 → AC-006, TEST-088 → AC-007, TEST-090 → AC-009.
 *
 * The API-side half of AC-001/002/003 lives in the server suites; these cover
 * the backoffice matrix, the 403 surface and fail-closed behaviour.
 */

const auth = {
  role: 'SUPER_ADMIN',
};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      email: 'amina@riaya.local',
      firstName: 'Amina',
      lastName: 'Ben',
      role: auth.role,
      preferredLocale: 'en',
      isActive: true,
      lastLoginAt: null,
    },
    ready: true,
    sessionMessage: null,
    setSessionMessage: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

import i18n from '../../src/i18n';
import { RoleRoute } from '../../src/auth/RoleRoute';
import { NAV_CAPABILITIES, canSee } from '../../src/auth/roles';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

function renderGuarded(role: 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST') {
  auth.role = role;
  return render(
    <MemoryRouter initialEntries={['/staff']}>
      <Routes>
        <Route
          path="/staff"
          element={
            <RoleRoute capability="manageStaff">
              <div>staff area</div>
            </RoleRoute>
          }
        />
        <Route path="/" element={<div>overview</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Role guard and 403 page', () => {
  it('AC-005: an unauthorised authenticated user sees the 403 page, not a redirect', () => {
    renderGuarded('RECEPTIONIST');

    expect(screen.getByRole('heading', { name: /you don't have access/i })).toBeInTheDocument();
    expect(screen.queryByText('staff area')).not.toBeInTheDocument();
    expect(screen.queryByText('overview')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to overview/i })).toBeInTheDocument();
  });

  it('AC-005: an authorised user reaches the guarded content', () => {
    renderGuarded('CLINIC_ADMIN');
    expect(screen.getByText('staff area')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /you don't have access/i })).toBeNull();
  });

  it('AC-007: the 403 page is localised and mirrors in Arabic', async () => {
    await i18n.changeLanguage('ar');
    renderGuarded('RECEPTIONIST');

    expect(screen.getByRole('heading', { name: 'لا تملك صلاحية الوصول' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'العودة إلى النظرة العامة' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('AC-006: navigation derives from the shared capability matrix', () => {
    for (const [key, capability] of Object.entries(NAV_CAPABILITIES)) {
      for (const role of USER_ROLES) {
        expect(canSee(role, key), `${key} for ${role}`).toBe(
          CAPABILITY_ROLES[capability].includes(role),
        );
      }
    }
  });

  it('AC-009: an unknown role or navigation key fails closed', () => {
    expect(canSee('OWNER' as never, 'staff')).toBe(false);
    expect(canSee('SUPER_ADMIN', 'not-a-route')).toBe(false);
  });
});
