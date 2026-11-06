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
  'viewDoctors',
  'manageDoctors',
  'viewScheduling',
  'applySchedule',
  'manageAppointments',
  'manageQueue',
  'readClinicalNotes',
  'viewAuditLog',
  'viewChat',
  'manageRoles',
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
  viewDoctors: ALL,
  manageDoctors: ADMIN,
  viewScheduling: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST', 'DOCTOR'],
  applySchedule: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
  manageAppointments: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
  manageQueue: ALL,
  readClinicalNotes: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  viewAuditLog: ADMIN,
  viewChat: ALL,
  manageRoles: ADMIN,
};

/** Group of each capability, for the permissions editor. */
export const CAPABILITY_GROUPS: Record<Capability, CapabilityGroupKey> = {
  viewOverview: 'workspace',
  viewDesignSystem: 'workspace',
  viewNotifications: 'communication',
  viewChat: 'communication',
  viewAppointments: 'appointments',
  viewCalendar: 'appointments',
  manageAppointments: 'appointments',
  viewWaitingList: 'appointments',
  manageQueue: 'appointments',
  viewPatients: 'patients',
  readClinicalNotes: 'patients',
  viewDoctors: 'doctors',
  manageDoctors: 'doctors',
  viewScheduling: 'scheduling',
  applySchedule: 'scheduling',
  viewAnalytics: 'analytics',
  manageStaff: 'administration',
  inviteStaff: 'administration',
  suspendMembership: 'administration',
  manageSettings: 'administration',
  manageRoles: 'administration',
  viewAuditLog: 'administration',
};

type CapabilityGroupKey =
  | 'workspace'
  | 'appointments'
  | 'patients'
  | 'doctors'
  | 'scheduling'
  | 'analytics'
  | 'communication'
  | 'administration';

/**
 * Capabilities the clinic-admin system role always keeps, so a clinic can never lock
 * itself out of role management. SUPER_ADMIN is not editable at all.
 */
export const LOCKED_ADMIN_CAPABILITIES: readonly Capability[] = [
  'manageRoles',
  'manageSettings',
  'manageStaff',
  'viewOverview',
];

/** Default capabilities of a system role (the matrix above). */
export function defaultCapabilities(role: string): Capability[] {
  return CAPABILITIES.filter((c) => CAPABILITY_ROLES[c].includes(role as UserRole));
}

/** Deny-by-default check against an explicit capability list (custom roles). */
export function hasCapability(
  capabilities: readonly string[] | null | undefined,
  capability: Capability,
): boolean {
  return Boolean(capabilities?.includes(capability));
}

/** Deny when the role, the capability, or the entry is unknown. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability]?.includes(role as UserRole) ?? false;
}
