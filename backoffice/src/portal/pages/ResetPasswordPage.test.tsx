import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { PortalResetPasswordPage, readResetToken } from './ResetPasswordPage';

jest.mock('../../layouts/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('PortalResetPasswordPage', () => {
  it('reads the token from the fragment and scrubs it from the URL', () => {
    window.history.replaceState(null, '', '/portal/reset-password#token=abc123');
    expect(readResetToken()).toBe('abc123');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/portal/reset-password');
  });

  it('shows the password form when a token is present and removes it from the address', () => {
    window.history.replaceState(null, '', '/portal/reset-password#token=abc123');
    render(
      <MemoryRouter>
        <PortalResetPasswordPage />
      </MemoryRouter>,
    );
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  it('shows the missing-link state without a token', () => {
    window.history.replaceState(null, '', '/portal/reset-password');
    render(
      <MemoryRouter>
        <PortalResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('This reset link is incomplete')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
