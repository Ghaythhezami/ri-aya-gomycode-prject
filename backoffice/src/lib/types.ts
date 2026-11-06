import type { Capability } from '@riaya/shared';
export type UserRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  preferredLocale: 'en' | 'ar' | 'fr';
  isActive: boolean;
  lastLoginAt: string | null;
  /** Effective capabilities in the active clinic (custom roles included). */
  capabilities?: Capability[];
  /** System role name or custom role slug of the membership. */
  roleKey?: string | null;
  /** Role name in the request language. */
  roleName?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ApiError {
  code?: string;
  message?: string;
  details?: unknown;
}
