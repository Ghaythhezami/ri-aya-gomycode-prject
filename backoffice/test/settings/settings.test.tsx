import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import '../../src/i18n';
import { defaultWorkingHours, type ClinicSettings } from '../../src/pages/settings/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}));

vi.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: [],
    active: {
      membershipId: 'm1',
      organizationId: 'o1',
      organizationName: 'Bright Org',
      clinicId: 'clinic-1',
      clinicName: 'Central Clinic',
      clinicTimezone: 'UTC',
      role: 'SUPER_ADMIN',
    },
    loading: false,
    switching: false,
    switchTo: vi.fn(),
    createClinic: vi.fn(),
    renameClinic: vi.fn(),
  }),
}));

import { SettingsPage } from '../../src/pages/SettingsPage';
import { ClinicInformationSection } from '../../src/pages/settings/ClinicInformationSection';
import { WorkingHoursSection } from '../../src/pages/settings/WorkingHoursSection';
import { RolesPermissionsSection } from '../../src/pages/settings/RolesPermissionsSection';
import { PlaceholderSection } from '../../src/pages/settings/PlaceholderSection';

const SETTINGS: ClinicSettings = {
  id: 'clinic-1',
  name: 'Central Clinic',
  address: 'Health District, Dubai',
  contactEmail: 'operations@centralclinic.example',
  phone: '+971 4 000 0000',
  defaultLanguage: 'en',
  timezone: 'UTC',
  currency: 'USD',
  workingHours: defaultWorkingHours(),
};

function renderSection(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('Settings screen', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
    mocks.get.mockResolvedValue({ data: SETTINGS });
  });

  it('AC-069: renders the eight settings sections and routes between panels', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<div>clinic panel</div>} />
            <Route path="*" element={<div>section panel</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Clinic information')).toBeInTheDocument();
    expect(screen.getByText('Roles & permissions')).toBeInTheDocument();
    expect(screen.getByText('clinic panel')).toBeInTheDocument();

    for (const label of [
      'Departments',
      'Working hours',
      'Appointments',
      'Reminders',
      'Roles & permissions',
      'Audit log',
      'Appearance',
    ]) {
      await userEvent.click(screen.getByRole('link', { name: new RegExp(label, 'i') }));
      expect(screen.getByText('section panel')).toBeInTheDocument();
    }
  });

  it('loads clinic information and saves the edited values', async () => {
    mocks.patch.mockImplementation((_url: string, body: Partial<ClinicSettings>) =>
      Promise.resolve({ data: { ...SETTINGS, ...body } }),
    );

    renderSection(<ClinicInformationSection />);

    const name = await screen.findByLabelText('Clinic name');
    expect(name).toHaveValue('Central Clinic');
    await userEvent.clear(name);
    await userEvent.type(name, 'Central Clinic — Lagos');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/clinics/settings',
      expect.objectContaining({
        name: 'Central Clinic — Lagos',
        address: 'Health District, Dubai',
        contactEmail: 'operations@centralclinic.example',
        defaultLanguage: 'en',
        timezone: 'UTC',
      }),
    );
  });

  it('adds a break and saves the working week', async () => {
    mocks.patch.mockImplementation((_url: string, body: Partial<ClinicSettings>) =>
      Promise.resolve({ data: { ...SETTINGS, ...body } }),
    );

    renderSection(<WorkingHoursSection />);

    expect(await screen.findByText('Monday')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Monday')).toHaveValue('08:00');
    await userEvent.click(screen.getAllByRole('button', { name: /add break/i })[0]);

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Working hours saved')).toBeInTheDocument();

    const body = mocks.patch.mock.calls[0][1] as {
      workingHours: { monday: { breaks: unknown[] } };
    };
    expect(body.workingHours.monday.breaks).toHaveLength(1);
  });

  it('rejects duplicate breaks before saving', async () => {
    renderSection(<WorkingHoursSection />);

    expect(await screen.findByText('Monday')).toBeInTheDocument();
    const addBreak = screen.getAllByRole('button', { name: /add break/i })[0];
    await userEvent.click(addBreak);
    await userEvent.click(addBreak);

    expect(screen.getByText(/Breaks cannot repeat or overlap/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('renders built-in and custom roles and creates a new custom role', async () => {
    const roles = [
      {
        id: 'SUPER_ADMIN',
        name: 'SUPER_ADMIN',
        baseRole: 'SUPER_ADMIN',
        isSystem: true,
        editable: false,
        accessLevel: 'full',
        permissions: ['viewOverview', 'manageSettings'],
        users: 2,
      },
      {
        id: 'CLINIC_ADMIN',
        name: 'CLINIC_ADMIN',
        baseRole: 'CLINIC_ADMIN',
        isSystem: true,
        editable: false,
        accessLevel: 'operations',
        permissions: ['viewOverview', 'manageStaff'],
        users: 1,
      },
      {
        id: 'role-1',
        name: 'Senior Doctor',
        baseRole: 'DOCTOR',
        isSystem: false,
        editable: true,
        accessLevel: 'limited',
        permissions: ['viewPatients', 'viewAppointments'],
        users: 0,
      },
    ];
    mocks.get.mockResolvedValue({ data: roles });
    mocks.post.mockResolvedValue({ data: roles[2] });

    renderSection(<RolesPermissionsSection />);

    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Super admin')).toBeInTheDocument();
    expect(table.getByText('Senior Doctor')).toBeInTheDocument();
    expect(table.getAllByText('System').length).toBeGreaterThan(0);
    expect(table.getByText('Custom')).toBeInTheDocument();
    expect(table.getByText('Operations')).toBeInTheDocument();
    expect(table.getByText('2 users')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add role/i }));
    await userEvent.type(await screen.findByLabelText('Role name'), 'Triage Nurse');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Role created')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/roles',
      expect.objectContaining({
        name: 'Triage Nurse',
        baseRole: 'RECEPTIONIST',
        permissions: expect.any(Array),
      }),
    );
  });

  it('deletes a custom role after confirmation', async () => {
    const customRole = {
      id: 'role-2',
      name: 'Triage Nurse',
      baseRole: 'RECEPTIONIST',
      isSystem: false,
      editable: true,
      accessLevel: 'limited',
      permissions: ['viewPatients'],
      users: 0,
    };
    mocks.get.mockResolvedValue({
      data: [
        {
          id: 'SUPER_ADMIN',
          name: 'SUPER_ADMIN',
          baseRole: 'SUPER_ADMIN',
          isSystem: true,
          editable: false,
          accessLevel: 'full',
          permissions: ['manageSettings'],
          users: 1,
        },
        customRole,
      ],
    });
    mocks.delete.mockResolvedValue({ data: { success: true } });

    renderSection(<RolesPermissionsSection />);

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete role triage nurse/i,
    });
    await userEvent.click(deleteButtons[0]);
    expect(await screen.findByText('Delete role?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText('Role deleted')).toBeInTheDocument();
    expect(mocks.delete).toHaveBeenCalledWith('/api/roles/role-2');
  });

  it('explains an unavailable placeholder section instead of a dead button', async () => {
    renderSection(<PlaceholderSection titleKey="settings.departments" />);

    await userEvent.click(screen.getByRole('button', { name: /open departments/i }));
    expect(screen.getByText('This section is not available yet.')).toBeInTheDocument();
  });
});
