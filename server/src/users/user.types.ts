import { UserRole } from './user-role.enum';

export type PreferredLocale = 'en' | 'ar' | 'fr';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  /**
   * @deprecated Clinic-scoped role now lives on UserMembership.role (FR-002).
   * Nullable because the column is being retired; read the active membership
   * instead of this field.
   */
  role: UserRole | null;
  isActive: boolean;
  preferredLocale: PreferredLocale;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  failedLoginWindowStart: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
