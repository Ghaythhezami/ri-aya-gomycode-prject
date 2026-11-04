import { CAPABILITY_ROLES, type Capability, type UserRole } from '@riaya/shared';

/**
 * Navigation key to capability. The capabilities and their roles live in
 * `@riaya/shared`, so this file only maps the shell's menu keys onto them.
 */
const NAV_CAPABILITIES: Record<string, Capability> = {
  overview: 'viewOverview',
  appointments: 'viewAppointments',
  calendar: 'viewCalendar',
  patients: 'viewPatients',
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
