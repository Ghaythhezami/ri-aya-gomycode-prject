import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/i18n';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  invitations: [] as unknown[],
}));

vi.mock('../../src/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'admin@riaya.local' } }),
}));

vi.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: [],
    active: {
      membershipId: 'm1',
      organizationId: 'o1',
      organizationName: 'Bright Org',
      clinicId: 'c1',
      clinicName: 'Bright Clinic',
      clinicTimezone: 'UTC',
      role: 'SUPER_ADMIN',
    },
    loading: false,
    switching: false,
    switchTo: vi.fn(),
    createClinic: vi.fn(),
  }),
}));

import { StaffDirectoryPage } from '../../src/pages/StaffDirectoryPage';

function renderPage() {
  return render(<StaffDirectoryPage />);
}

describe('Staff invitation feedback', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.invitations = [];
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/api/invitations' ? mocks.invitations : [] }),
    );
  });

  it('confirms a successful send', async () => {
    mocks.post.mockResolvedValue({ data: { deliveryStatus: 'SENT' } });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'new.member@riaya.local');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByText('Invitation sent')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/api/invitations', {
      email: 'new.member@riaya.local',
      clinicId: 'c1',
      role: 'RECEPTIONIST',
    });
  });

  it('shows a sending state until the request finishes', async () => {
    let resolvePost: ((value: unknown) => void) | undefined;
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'new.member@riaya.local');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    expect(screen.getByText('Sending invitation…')).toBeInTheDocument();

    resolvePost?.({ data: { deliveryStatus: 'SENT' } });
    expect(await screen.findByText('Invitation sent')).toBeInTheDocument();
  });

  it('explains that a pending invitation already exists', async () => {
    mocks.post.mockRejectedValue({
      response: { data: { code: 'INVITATION_ALREADY_PENDING' } },
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'pending.member@riaya.local');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already pending/i);
  });

  it('explains that the person is already a member', async () => {
    mocks.post.mockRejectedValue({
      response: { data: { code: 'ALREADY_A_MEMBER' } },
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'member@riaya.local');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already a member/i);
  });

  it('reports a failed delivery instead of claiming success', async () => {
    mocks.post.mockResolvedValue({ data: { deliveryStatus: 'FAILED' } });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'new.member@riaya.local');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be delivered/i);
    expect(screen.queryByText('Invitation sent')).not.toBeInTheDocument();
  });

  it('reports a failed resend', async () => {
    mocks.invitations = [
      {
        id: 'inv-1',
        email: 'pending.member@riaya.local',
        role: 'DOCTOR',
        status: 'PENDING',
        displayStatus: 'PENDING',
        deliveryStatus: 'SENT',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
    mocks.post.mockResolvedValue({ data: { deliveryStatus: 'FAILED' } });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /resend/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be resent/i);
    expect(mocks.post).toHaveBeenCalledWith('/api/invitations/inv-1/resend');
  });
});
