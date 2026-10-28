export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLINIC_ADMIN: 'CLINIC_ADMIN',
  DOCTOR: 'DOCTOR',
  RECEPTIONIST: 'RECEPTIONIST',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CLINIC_ADMIN];
