import { canSeeNav } from './roles';

const custom = (capabilities: string[]) => ({ role: 'RECEPTIONIST', capabilities });

describe('navigation follows capabilities', () => {
  it('shows scheduling, analytics and settings from capabilities, not the role name', () => {
    const u = custom(['viewOverview', 'viewAnalytics']);
    expect(canSeeNav(u, 'analytics')).toBe(true);
    expect(canSeeNav(u, 'scheduling')).toBe(false);
    expect(canSeeNav(u, 'settings')).toBe(false);
    expect(canSeeNav(custom(['viewScheduling']), 'scheduling')).toBe(true);
    expect(canSeeNav(custom(['manageSettings']), 'settings')).toBe(true);
  });

  it('opens settings for role managers (Roles section) and denies unknown keys', () => {
    expect(canSeeNav(custom(['manageRoles']), 'settings')).toBe(true);
    expect(canSeeNav(custom(['manageRoles']), 'analytics')).toBe(false);
    expect(canSeeNav(custom(['manageRoles']), 'nope')).toBe(false);
    expect(canSeeNav(null, 'settings')).toBe(false);
  });

  it('falls back to the role matrix for a payload without capabilities', () => {
    expect(canSeeNav({ role: 'DOCTOR' }, 'analytics')).toBe(true);
    expect(canSeeNav({ role: 'RECEPTIONIST' }, 'analytics')).toBe(false);
  });
});
