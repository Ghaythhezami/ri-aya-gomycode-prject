import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** TEST-089 → AC-008 (a workspace switch re-reads the role after reload). */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const reload = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/api', () => ({
  api,
  getAccessToken: () => null,
  setAccessToken: vi.fn(),
}));

import { WorkspaceProvider, useWorkspace } from '../../src/auth/WorkspaceContext';

function Probe() {
  const { active, switchTo } = useWorkspace();
  return (
    <div>
      <span>{active?.clinicName ?? 'none'}</span>
      <span>{active?.role ?? 'none'}</span>
      <button type="button" onClick={() => void switchTo('c2')}>
        switch
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, reload });
  api.get.mockResolvedValue({
    data: [
      {
        membershipId: 'm1',
        organizationId: 'o1',
        organizationName: 'Bright Org',
        clinicId: 'c1',
        clinicName: 'Clinic One',
        clinicTimezone: 'UTC',
        role: 'DOCTOR',
      },
      {
        membershipId: 'm2',
        organizationId: 'o1',
        organizationName: 'Bright Org',
        clinicId: 'c2',
        clinicName: 'Clinic Two',
        clinicTimezone: 'UTC',
        role: 'CLINIC_ADMIN',
      },
    ],
  });
  api.post.mockResolvedValue({ data: { accessToken: 'new-token' } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Workspace role refresh', () => {
  it('AC-008: switching workspace re-issues the token and reloads the session', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );

    expect(await screen.findByText('Clinic One')).toBeInTheDocument();
    expect(screen.getByText('DOCTOR')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/auth/switch-workspace', { clinicId: 'c2' }),
    );
    // The reload is what makes the guards and navigation read the new role.
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
