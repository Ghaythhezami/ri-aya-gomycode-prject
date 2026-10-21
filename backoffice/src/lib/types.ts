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
