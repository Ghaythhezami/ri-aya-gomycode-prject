import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TEST-069 → AC-009, TEST-070 → AC-010, TEST-071 → AC-011, TEST-072 → AC-012.
 */

const mocks = {
  user: {
    id: 'u1',
    email: 'amina@riaya.local',
    firstName: 'Amina',
    lastName: 'Ben',
    role: 'SUPER_ADMIN',
    preferredLocale: 'en',
    isActive: true,
    lastLoginAt: null,
  },
  active: {
    membershipId: 'm1',
    organizationId: 'o1',
    organizationName: 'Bright Org',
    clinicId: 'c1',
    clinicName: 'Bright Clinic',
    clinicTimezone: 'UTC',
    role: 'SUPER_ADMIN',
  },
  memberships: [] as unknown[],
};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    sessionMessage: null,
    setSessionMessage: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock('../../src/auth/WorkspaceContext', () => ({
  useWorkspace: () => ({
    memberships: mocks.memberships,
    active: mocks.active,
    loading: false,
    switching: false,
    switchTo: jest.fn(),
  }),
}));

jest.mock('../../src/features/notifications/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
jest.mock('../../src/features/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));
jest.mock('../../src/features/chat/ChatLauncher', () => ({ ChatLauncher: () => null }));
jest.mock('../../src/features/assistant/AssistantLauncher', () => ({
  AssistantLauncher: () => null,
}));
jest.mock('../../src/features/booking/BookingWizard', () => ({ BookingWizard: () => null }));
jest.mock('../../src/features/search/GlobalSearch', () => ({
  GlobalSearch: () => <input role="combobox" aria-label="Search patients and appointments" />,
}));

import i18n from '../../src/i18n';
import { AppShell } from '../../src/layouts/AppShell';

const root = join(__dirname, '../..');

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function flatten(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  cleanup();
  document.documentElement.dir = 'ltr';
  await i18n.changeLanguage('en');
});

describe('Shell accessibility and localisation', () => {
  it('AC-009: the skip link is first and the user menu is keyboard operable', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    const focusable = [
      ...container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    expect(focusable[0]?.getAttribute('href')).toBe('#main');
    expect(screen.getByRole('link', { name: /skip to content/i })).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /user menu/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: /user menu/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: /user menu/i })).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('AC-010: no physical-direction utility is rendered and the sidebar anchors logically', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderShell();

    const offenders: string[] = [];
    for (const node of [container, ...container.querySelectorAll('*')]) {
      const className = (node as HTMLElement).className;
      if (typeof className !== 'string') continue;
      if (/(?<![\w-])(?:ml|mr|pl|pr|left|right)-[\w[]/.test(className)) {
        offenders.push(className);
      }
    }
    expect(offenders).toEqual([]);

    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('start-0');
  });

  it('AC-011: every shell control keeps the 40px target floor', () => {
    renderShell();

    const controls: Array<[HTMLElement, RegExp]> = [
      [screen.getByRole('button', { name: /open menu/i }), /size-11/],
      [screen.getByRole('button', { name: /collapse sidebar/i }), /min-h-10/],
      [screen.getByRole('button', { name: /user menu/i }), /min-h-10/],
    ];

    for (const [control, pattern] of controls) {
      expect(control.className, control.getAttribute('aria-label') ?? '').toMatch(pattern);
    }
  });

  it('AC-012: every new shell string exists in en, ar and fr, and Arabic renders', async () => {
    const keys = [
      'shell.skipToContent',
      'shell.expandSidebar',
      'shell.collapseSidebar',
      'shell.chat',
      'shell.userMenu',
      'shell.noWorkspace',
      'breadcrumbs.label',
      'forbidden.title',
      'forbidden.body',
      'forbidden.back',
    ];

    const catalogues = ['en', 'ar', 'fr'].map((locale) =>
      flatten(JSON.parse(readFileSync(join(root, `src/i18n/${locale}.json`), 'utf8'))),
    );

    for (const catalogue of catalogues) {
      for (const key of keys) {
        expect(catalogue, `${key} missing`).toContain(key);
      }
    }

    await i18n.changeLanguage('ar');
    renderShell();
    expect(screen.getByRole('button', { name: 'طي الشريط الجانبي' })).toBeInTheDocument();
  });
});
