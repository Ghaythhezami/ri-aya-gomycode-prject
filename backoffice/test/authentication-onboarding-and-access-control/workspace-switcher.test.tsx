import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/i18n';

const mocks = vi.hoisted(() => ({
  workspace: {
    memberships: [] as Array<Record<string, unknown>>,
    active: null as Record<string, unknown> | null,
    loading: false,
    switching: false,
    switchTo: vi.fn(),
    createClinic: vi.fn(),
    renameClinic: vi.fn(),
  },
}));

vi.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => mocks.workspace,
}));

import { WorkspaceSwitcher } from '../../src/layouts/WorkspaceSwitcher';

const bright = {
  membershipId: 'm1',
  organizationId: 'o1',
  organizationName: 'Bright Org',
  clinicId: 'c1',
  clinicName: 'Bright Clinic',
  clinicTimezone: 'UTC',
  role: 'SUPER_ADMIN',
};

const second = {
  ...bright,
  membershipId: 'm2',
  clinicId: 'c2',
  clinicName: 'Second Clinic',
  role: 'CLINIC_ADMIN',
};

describe('Workspace switcher (v2 extension)', () => {
  beforeEach(() => {
    cleanup();
    mocks.workspace.memberships = [bright, second];
    mocks.workspace.active = bright;
    mocks.workspace.switching = false;
    mocks.workspace.switchTo.mockReset();
    mocks.workspace.switchTo.mockResolvedValue(undefined);
    mocks.workspace.createClinic.mockReset();
    mocks.workspace.createClinic.mockResolvedValue(undefined);
  });

  it('AC-072: lists every membership, marks the active clinic and leaves the header free of a duplicate', async () => {
    render(<WorkspaceSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: /switch clinic/i }));

    expect(screen.getByRole('listbox', { name: /clinics/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /bright clinic/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /second clinic/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // The switcher is the single active-clinic control; the page header must not
    // repeat the clinic name as a heading.
    expect(screen.queryByRole('heading', { name: /bright clinic/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /second clinic/i }));
    expect(mocks.workspace.switchTo).toHaveBeenCalledWith('c2');
  });

  it('AC-075: disables repeat switches while switching and validates the create-clinic dialog', async () => {
    mocks.workspace.switching = true;
    const { unmount } = render(<WorkspaceSwitcher />);

    const trigger = screen.getByRole('button', { name: /switch clinic/i });
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Switching…')).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.getByRole('option', { name: /second clinic/i })).toBeDisabled();
    unmount();

    mocks.workspace.switching = false;
    mocks.workspace.createClinic.mockRejectedValue({
      response: { data: { code: 'CLINIC_NAME_REQUIRED' } },
    });
    render(<WorkspaceSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: /switch clinic/i }));
    await userEvent.click(screen.getByRole('button', { name: /create clinic/i }));

    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /create clinic/i });
    expect(submit).toBeDisabled();

    const name = within(dialog).getByLabelText(/clinic name/i);
    await userEvent.type(name, 'A');
    expect(submit).toBeDisabled();
    await userEvent.type(name, 'B');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a clinic name/i);
    expect(mocks.workspace.createClinic).toHaveBeenCalledWith('AB');
  });
});
