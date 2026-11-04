/**
 * One capability matrix for the API and the backoffice (BP-011).
 *
 * The server guard and the client navigation both read this module, so a
 * permission cannot mean one thing in the API and another in the UI. Roles are
 * strings that match the Prisma `UserRole` enum. An unknown role or capability
 * is denied, never allowed by default.
 */

import { userRoleSchema, type UserRole } from './schemas/tenancy';

/** The same four roles the schemas and the Prisma enum define. */
export const USER_ROLES = userRoleSchema.options;

export const CAPABILITIES = [
  'viewOverview',
  'viewAppointments',
  'viewCalendar',
  'viewPatients',
  'viewWaitingList',
  'viewNotifications',
  'viewDesignSystem',
  'viewAnalytics',
  'manageStaff',
  'inviteStaff',
  'suspendMembership',
  'manageSettings',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL = USER_ROLES;
const ADMIN = ['SUPER_ADMIN', 'CLINIC_ADMIN'] as const;

export const CAPABILITY_ROLES: Record<Capability, readonly UserRole[]> = {
  viewOverview: ALL,
  viewAppointments: ALL,
  viewCalendar: ALL,
  viewPatients: ALL,
  viewWaitingList: ALL,
  viewNotifications: ALL,
  viewDesignSystem: ALL,
  viewAnalytics: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  manageStaff: ADMIN,
  inviteStaff: ADMIN,
  suspendMembership: ADMIN,
  manageSettings: ADMIN,
};

/** Deny when the role, the capability, or the entry is unknown. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability]?.includes(role as UserRole) ?? false;
}
