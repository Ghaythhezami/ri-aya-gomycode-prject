import { randomUUID } from 'crypto';
import { UserRole } from '../users/user-role.enum';
import type { PreferredLocale, UserRecord } from '../users/user.types';

interface RefreshRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
}

interface ResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class MemoryPrisma {
  private users = new Map<string, UserRecord>();
  private refreshTokens = new Map<string, RefreshRecord>();
  private resetTokens = new Map<string, ResetRecord>();

  readonly user = {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id) return this.users.get(where.id) ?? null;
      if (where.email) {
        return [...this.users.values()].find((item) => item.email === where.email) ?? null;
      }
      return null;
    },
    create: async ({
      data,
    }: {
      data: Partial<UserRecord> & { email: string; passwordHash: string };
    }) => {
      const now = new Date();
      const row: UserRecord = {
        id: data.id ?? randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        role: (data.role as UserRole) ?? UserRole.RECEPTIONIST,
        isActive: data.isActive ?? true,
        preferredLocale: (data.preferredLocale as PreferredLocale) ?? 'en',
        lastLoginAt: data.lastLoginAt ?? null,
        failedLoginCount: data.failedLoginCount ?? 0,
        failedLoginWindowStart: data.failedLoginWindowStart ?? null,
        lockedUntil: data.lockedUntil ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRecord> }) => {
      const current = this.users.get(where.id);
      if (!current) throw new Error('User not found');
      const next = { ...current, ...data, updatedAt: new Date() };
      this.users.set(where.id, next);
      return next;
    },
  };

  readonly refreshToken = {
    findUnique: async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
      if (where.id) return this.refreshTokens.get(where.id) ?? null;
      if (where.tokenHash) {
        return (
          [...this.refreshTokens.values()].find((item) => item.tokenHash === where.tokenHash) ??
          null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Omit<RefreshRecord, 'id' | 'createdAt'> }) => {
      const row: RefreshRecord = { ...data, id: randomUUID(), createdAt: new Date() };
      this.refreshTokens.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<RefreshRecord> }) => {
      const current = this.refreshTokens.get(where.id);
      if (!current) throw new Error('Refresh token not found');
      const next = { ...current, ...data };
      this.refreshTokens.set(where.id, next);
      return next;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { familyId?: string; userId?: string; revokedAt?: Date | null };
      data: Partial<RefreshRecord>;
    }) => {
      let count = 0;
      for (const [id, token] of this.refreshTokens) {
        const familyOk = where.familyId ? token.familyId === where.familyId : true;
        const userOk = where.userId ? token.userId === where.userId : true;
        const revokedOk =
          where.revokedAt === null
            ? token.revokedAt === null
            : where.revokedAt === undefined
              ? true
              : true;
        if (familyOk && userOk && revokedOk) {
          this.refreshTokens.set(id, { ...token, ...data });
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly passwordResetToken = {
    findUnique: async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
      if (where.id) return this.resetTokens.get(where.id) ?? null;
      if (where.tokenHash) {
        return (
          [...this.resetTokens.values()].find((item) => item.tokenHash === where.tokenHash) ?? null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Omit<ResetRecord, 'id' | 'createdAt'> }) => {
      const row: ResetRecord = { ...data, id: randomUUID(), createdAt: new Date() };
      this.resetTokens.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ResetRecord> }) => {
      const current = this.resetTokens.get(where.id);
      if (!current) throw new Error('Reset token not found');
      const next = { ...current, ...data };
      this.resetTokens.set(where.id, next);
      return next;
    },
  };

  async $connect() {
    return undefined;
  }

  async $disconnect() {
    return undefined;
  }

  async $queryRaw() {
    return [{ ok: 1 }];
  }

  async $queryRawUnsafe(_query: string) {
    return [{ ok: 1 }];
  }
}
