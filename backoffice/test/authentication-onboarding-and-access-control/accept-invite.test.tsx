import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/i18n';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  login: vi.fn(),
  user: null as { email: string } | null,
}));

vi.mock('../../src/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post },
  setAccessToken: vi.fn(),
}));

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, login: mocks.login }),
}));

import { AcceptInvitePage } from '../../src/pages/AcceptInvitePage';

function scope(overrides: Record<string, unknown> = {}) {
  return {
    email: 'invitee@riaya.local',
    organizationId: 'org-1',
    organizationName: 'Bright Org',
    clinicId: 'clinic-1',
    clinicName: 'Bright Clinic',
    role: 'DOCTOR',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    emailKnown: false,
    ...overrides,
  };
}

function renderPage(entry = '/accept-invite?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AcceptInvitePage />
    </MemoryRouter>,
  );
}

/** TEST-046 → AC-036 */
describe('Accept-invitation states (AC-036)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.login.mockReset();
    mocks.user = null;
  });

  it('explains a missing token instead of showing a dead form', () => {
    renderPage('/accept-invite');

    expect(screen.getByText(/invitation link incomplete/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('offers profile and login details to a brand-new invitee', async () => {
    mocks.get.mockResolvedValue({ data: scope() });

    renderPage();

    expect(await screen.findByText('Bright Clinic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline invitation/i })).toBeInTheDocument();
    // The invite carries the clinic, so the accept page never asks for one.
    expect(screen.queryByLabelText(/clinic name/i)).not.toBeInTheDocument();
  });

  it('requires an existing account to sign in before accepting', async () => {
    mocks.get.mockResolvedValue({ data: scope({ emailKnown: true }) });

    renderPage();

    expect(await screen.findByText(/account already exists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in and accept/i })).toBeInTheDocument();
  });

  it('declines without creating an account', async () => {
    mocks.get.mockResolvedValue({ data: scope() });
    mocks.post.mockResolvedValue({ data: { success: true } });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /decline invitation/i }));

    expect(mocks.post).toHaveBeenCalledWith('/api/invitations/abc123/decline', {
      token: 'abc123',
    });
    expect(await screen.findByText(/invitation declined/i)).toBeInTheDocument();
  });
});
