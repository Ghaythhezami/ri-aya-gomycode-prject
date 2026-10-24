import { UserRole } from './user-role.enum';

export type PreferredLocale = 'en' | 'ar' | 'fr';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  preferredLocale: PreferredLocale;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  failedLoginWindowStart: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
