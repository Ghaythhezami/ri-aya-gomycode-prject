import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The wizard only needs the auth surface for its final submit; the provider would
// otherwise fire a refresh request on mount.
vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, login: vi.fn(), setSessionMessage: vi.fn() }),
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import '../../src/i18n';
import { RegisterPage } from '../../src/pages/RegisterPage';

/** TEST-045 → AC-002 */
describe('Registration wizard (AC-002)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('preserves the entered values when the user steps back', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    // fireEvent rather than userEvent: the latter's async timer plumbing hangs
    // under jsdom here, and the behaviour under test is plain state retention.
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'wizard@riaya.local' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'WizardPass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Wizard' } });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    // Nothing is submitted and nothing is lost on the way back.
    expect(screen.getByLabelText(/email/i)).toHaveValue('wizard@riaya.local');
    expect(screen.getByLabelText(/password/i)).toHaveValue('WizardPass123!');
  });
});
