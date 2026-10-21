import type { UserRole } from '../lib/types';

export const NAV_ROLES: Record<string, UserRole[]> = {
  overview: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  appointments: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  calendar: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  patients: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  staff: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  waiting: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  analytics: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  notifications: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  settings: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  designSystem: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
};

export function canSee(role: UserRole, key: string) {
  return NAV_ROLES[key]?.includes(role) ?? false;
}
