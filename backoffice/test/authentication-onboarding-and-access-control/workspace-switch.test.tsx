import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post },
  setAccessToken: mocks.setAccessToken,
  getAccessToken: mocks.getAccessToken,
}));

import { WorkspaceProvider, useWorkspace } from '../../src/auth/WorkspaceContext';

const originalLocation = window.location;

const memberships = [
  {
    membershipId: 'm1',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c1',
    clinicName: 'Bright Clinic',
    clinicTimezone: 'UTC',
    role: 'SUPER_ADMIN',
  },
  {
    membershipId: 'm2',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c2',
    clinicName: 'Second Clinic',
    clinicTimezone: 'UTC',
    role: 'CLINIC_ADMIN',
  },
];

function Probe() {
  const { active, switchTo } = useWorkspace();
  const [error, setError] = useState('');

  return (
    <div>
      <span>{active?.clinicName}</span>
      <button type="button" onClick={() => void switchTo('c2').catch(() => setError('failed'))}>
        Switch
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}

describe('Workspace switch (v2 extension)', () => {
  beforeEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { reload: mocks.reload, href: 'http://localhost/' },
    });
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.setAccessToken.mockReset();
    mocks.getAccessToken.mockReset();
    mocks.reload.mockReset();
    mocks.getAccessToken.mockReturnValue(null);
    mocks.get.mockResolvedValue({ data: memberships });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('AC-073: proves the rotated refresh before reloading and stays off signup on failure', async () => {
    mocks.post.mockImplementation((url: string) =>
      Promise.resolve({
        data: { accessToken: url === '/api/auth/refresh' ? 'refreshed-token' : 'new-token' },
      }),
    );

    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    expect(await screen.findByText('Bright Clinic')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /switch/i }));

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/api/auth/switch-workspace', { clinicId: 'c2' });
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/api/auth/refresh');
    expect(mocks.setAccessToken).toHaveBeenNthCalledWith(1, 'new-token');
    expect(mocks.setAccessToken).toHaveBeenNthCalledWith(2, 'refreshed-token');
    expect(window.location.href).toBe('http://localhost/');

    cleanup();
    mocks.reload.mockClear();
    mocks.post.mockReset();
    mocks.post.mockRejectedValue(new Error('switch rejected'));
    mocks.get.mockResolvedValue({ data: memberships });

    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    expect(await screen.findByText('Bright Clinic')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /switch/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('failed');
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost/');
  });
});
