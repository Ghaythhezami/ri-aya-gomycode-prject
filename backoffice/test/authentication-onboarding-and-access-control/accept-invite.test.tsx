import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import '../../src/i18n';
import { AcceptInvitePage } from '../../src/pages/AcceptInvitePage';

/** TEST-046 → AC-036 */
describe('Accept-invitation states (AC-036)', () => {
  it('explains a missing token instead of showing a dead form', () => {
    render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <AcceptInvitePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/invitation link incomplete/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows the form when the link carries a token', () => {
    render(
      <MemoryRouter initialEntries={['/accept-invite?token=abc123']}>
        <AcceptInvitePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /accept invitation/i })).toBeInTheDocument();
  });
});
