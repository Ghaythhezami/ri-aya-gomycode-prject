import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    user: null,
    ready: true,
    sessionMessage: null,
    setSessionMessage: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

// The app owns its BrowserRouter, so swap it for a memory router rooted at the
// legacy path under test.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    BrowserRouter: ({ children }: { children: ReactNode }) => (
      <actual.MemoryRouter initialEntries={['/signup']}>{children}</actual.MemoryRouter>
    ),
  };
});

import '../../src/i18n';
import App from '../../src/App';

/** TEST-047 → AC-044 */
describe('Legacy signup route (AC-044)', () => {
  it('lands on the registration wizard, not the retired approval screen', () => {
    render(<App />);

    // The wizard's own heading. The retired screen said the account was waiting
    // for clinic-admin approval.
    expect(screen.getByText(/create your clinic/i)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for clinic admin approval/i)).not.toBeInTheDocument();
  });
});
