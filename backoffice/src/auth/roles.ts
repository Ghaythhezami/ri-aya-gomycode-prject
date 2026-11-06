import { canUser } from './permissions';
import { CAPABILITY_ROLES, type Capability, type UserRole } from '@riaya/shared';

/**
 * Navigation key to capability. The capabilities and their roles live in
 * `@riaya/shared`, so this file only maps the shell's menu keys onto them.
 */
export const NAV_CAPABILITIES: Record<string, Capability> = {
  overview: 'viewOverview',
  appointments: 'viewAppointments',
  calendar: 'viewCalendar',
  patients: 'viewPatients',
  doctors: 'viewDoctors',
  scheduling: 'viewScheduling',
  staff: 'manageStaff',
  waiting: 'viewWaitingList',
  analytics: 'viewAnalytics',
  notifications: 'viewNotifications',
  settings: 'manageSettings',
  designSystem: 'viewDesignSystem',
};

/** Derived role lists, for callers that still need the plain arrays. */
export const NAV_ROLES: Record<string, UserRole[]> = Object.fromEntries(
  Object.entries(NAV_CAPABILITIES).map(([key, capability]) => [
    key,
    [...CAPABILITY_ROLES[capability]],
  ]),
);

/** Deny when the role or the navigation key is unknown (fail closed). */
export function canSee(role: UserRole, key: string) {
  const capability = NAV_CAPABILITIES[key];
  return capability ? CAPABILITY_ROLES[capability].includes(role) : false;
}

/**
 * Whether the signed-in user sees a navigation item, from the effective capabilities of
 * the membership (custom roles included). Settings also opens for role managers, whose
 * only section is Roles.
 */
export function canSeeNav(
  user: { role?: string | null; capabilities?: readonly string[] } | null | undefined,
  key: string,
): boolean {
  const capability = NAV_CAPABILITIES[key];
  if (!capability) return false;
  if (canUser(user, capability)) return true;
  return key === 'settings' && canUser(user, 'manageRoles');
}
