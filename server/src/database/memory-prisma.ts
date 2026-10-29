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
  /** Clinic scope this session was issued for (FR-003); null for a legacy row. */
  clinicId: string | null;
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

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ClinicRecord {
  id: string;
  organizationId: string;
  name: string;
  timezone: string;
  currency: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  clinicId: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
}

interface InvitationRecord {
  id: string;
  email: string;
  organizationId: string;
  clinicId: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  invitedById: string | null;
  createdAt: Date;
}

interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  organizationId: string | null;
  clinicId: string | null;
  createdAt: Date;
}

type MembershipWhere = {
  userId?: string;
  clinicId?: string;
  organizationId?: string;
  role?: UserRole;
  status?: 'ACTIVE' | 'SUSPENDED';
};

interface MemorySnapshot {
  users: Map<string, UserRecord>;
  refreshTokens: Map<string, RefreshRecord>;
  resetTokens: Map<string, ResetRecord>;
  organizations: Map<string, OrganizationRecord>;
  clinics: Map<string, ClinicRecord>;
  memberships: Map<string, MembershipRecord>;
  invitations: Map<string, InvitationRecord>;
  auditLogs: Map<string, AuditLogRecord>;
}

export class MemoryPrisma {
  private users = new Map<string, UserRecord>();
  private refreshTokens = new Map<string, RefreshRecord>();
  private resetTokens = new Map<string, ResetRecord>();
  private organizations = new Map<string, OrganizationRecord>();
  private clinics = new Map<string, ClinicRecord>();
  private memberships = new Map<string, MembershipRecord>();
  private invitations = new Map<string, InvitationRecord>();
  private auditLogs = new Map<string, AuditLogRecord>();

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
      const row: RefreshRecord = {
        ...data,
        clinicId: data.clinicId ?? null,
        id: randomUUID(),
        createdAt: new Date(),
      };
      this.refreshTokens.set(row.id, row);
      return row;
    },
    findMany: async ({
      where,
    }: {
      where?: { userId?: string; familyId?: string; revokedAt?: Date | null };
    } = {}) => {
      return [...this.refreshTokens.values()].filter((token) => {
        const userOk = where?.userId ? token.userId === where.userId : true;
        const familyOk = where?.familyId ? token.familyId === where.familyId : true;
        const revokedOk = where?.revokedAt === null ? token.revokedAt === null : true;
        return userOk && familyOk && revokedOk;
      });
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

  readonly organization = {
    create: async ({ data }: { data: { name: string; slug: string } }) => {
      const now = new Date();
      const row: OrganizationRecord = {
        id: randomUUID(),
        name: data.name,
        slug: data.slug,
        createdAt: now,
        updatedAt: now,
      };
      this.organizations.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id?: string; slug?: string } }) => {
      if (where.id) return this.organizations.get(where.id) ?? null;
      if (where.slug) {
        return [...this.organizations.values()].find((item) => item.slug === where.slug) ?? null;
      }
      return null;
    },
  };

  readonly clinic = {
    create: async ({
      data,
    }: {
      data: {
        organizationId: string;
        name: string;
        timezone?: string;
        currency?: string;
        address?: string | null;
      };
    }) => {
      const now = new Date();
      const row: ClinicRecord = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        timezone: data.timezone ?? 'UTC',
        currency: data.currency ?? 'USD',
        address: data.address ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.clinics.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.clinics.get(where.id) ?? null,
  };

  readonly userMembership = {
    create: async ({
      data,
    }: {
      data: {
        userId: string;
        organizationId: string;
        clinicId: string;
        role: UserRole;
        status?: 'ACTIVE' | 'SUSPENDED';
      };
    }) => {
      const now = new Date();
      const row: MembershipRecord = {
        id: randomUUID(),
        userId: data.userId,
        organizationId: data.organizationId,
        clinicId: data.clinicId,
        role: data.role,
        status: data.status ?? 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      this.memberships.set(row.id, row);
      return row;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId_clinicId: { userId: string; clinicId: string } };
      create: {
        userId: string;
        organizationId: string;
        clinicId: string;
        role: UserRole;
        status?: 'ACTIVE' | 'SUSPENDED';
      };
      update: { role?: UserRole; status?: 'ACTIVE' | 'SUSPENDED' };
    }) => {
      const existing = [...this.memberships.values()].find(
        (item) =>
          item.userId === where.userId_clinicId.userId &&
          item.clinicId === where.userId_clinicId.clinicId,
      );
      if (existing) {
        const next = { ...existing, ...update, updatedAt: new Date() };
        this.memberships.set(existing.id, next);
        return next;
      }
      const now = new Date();
      const row: MembershipRecord = {
        id: randomUUID(),
        userId: create.userId,
        organizationId: create.organizationId,
        clinicId: create.clinicId,
        role: create.role,
        status: create.status ?? 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      this.memberships.set(row.id, row);
      return row;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: MembershipWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      const matches = [...this.memberships.values()].filter((item) =>
        this.membershipMatches(item, where),
      );
      return this.sortByCreatedAt(matches, orderBy)[0] ?? null;
    },
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: MembershipWhere;
      include?: { clinic?: boolean; organization?: boolean };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      const matches = [...this.memberships.values()].filter((item) =>
        this.membershipMatches(item, where),
      );
      return this.sortByCreatedAt(matches, orderBy).map((item) => ({
        ...item,
        clinic: include?.clinic ? (this.clinics.get(item.clinicId) ?? null) : undefined,
        organization: include?.organization
          ? (this.organizations.get(item.organizationId) ?? null)
          : undefined,
      }));
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.memberships.get(where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status?: 'ACTIVE' | 'SUSPENDED'; role?: UserRole };
    }) => {
      const current = this.memberships.get(where.id);
      if (!current) throw new Error('Membership not found');
      const next = { ...current, ...data, updatedAt: new Date() };
      this.memberships.set(where.id, next);
      return next;
    },
    count: async ({ where }: { where: MembershipWhere & { id?: { not?: string } } }) => {
      return [...this.memberships.values()].filter(
        (item) =>
          this.membershipMatches(item, where) && (where.id?.not ? item.id !== where.id.not : true),
      ).length;
    },
  };

  readonly auditLog = {
    create: async ({
      data,
    }: {
      data: {
        actorUserId?: string | null;
        action: string;
        entity: string;
        entityId: string;
        before?: unknown;
        after?: unknown;
        organizationId?: string | null;
        clinicId?: string | null;
      };
    }) => {
      const row: AuditLogRecord = {
        id: randomUUID(),
        actorUserId: data.actorUserId ?? null,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        before: data.before ?? null,
        after: data.after ?? null,
        organizationId: data.organizationId ?? null,
        clinicId: data.clinicId ?? null,
        createdAt: new Date(),
      };
      this.auditLogs.set(row.id, row);
      return row;
    },
  };

  readonly invitation = {
    create: async ({
      data,
    }: {
      data: {
        email: string;
        organizationId: string;
        clinicId: string;
        role: UserRole;
        tokenHash: string;
        expiresAt: Date;
        consumedAt?: Date | null;
        invitedById?: string | null;
      };
    }) => {
      const row: InvitationRecord = {
        id: randomUUID(),
        email: data.email,
        organizationId: data.organizationId,
        clinicId: data.clinicId,
        role: data.role,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        consumedAt: data.consumedAt ?? null,
        invitedById: data.invitedById ?? null,
        createdAt: new Date(),
      };
      this.invitations.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
      if (where.id) return this.invitations.get(where.id) ?? null;
      if (where.tokenHash) {
        return (
          [...this.invitations.values()].find((item) => item.tokenHash === where.tokenHash) ?? null
        );
      }
      return null;
    },
    findMany: async ({
      where,
      select,
      orderBy,
    }: {
      where: { clinicId?: string; consumedAt?: Date | null; expiresAt?: { gt?: Date } };
      select?: Record<string, boolean>;
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      const matches = [...this.invitations.values()].filter((item) => {
        if (where.clinicId && item.clinicId !== where.clinicId) return false;
        if (where.consumedAt === null && item.consumedAt !== null) return false;
        if (where.expiresAt?.gt && item.expiresAt.getTime() <= where.expiresAt.gt.getTime()) {
          return false;
        }
        return true;
      });
      const rows = this.sortByCreatedAt(matches, orderBy);
      return select ? rows.map((row) => this.pick(row, select)) : rows;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { consumedAt?: Date | null };
    }) => {
      const current = this.invitations.get(where.id);
      if (!current) throw new Error('Invitation not found');
      const next = { ...current, ...data };
      this.invitations.set(where.id, next);
      return next;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { email?: string; clinicId?: string; consumedAt?: Date | null };
      data: { consumedAt?: Date | null };
    }) => {
      let count = 0;
      for (const [id, invitation] of this.invitations) {
        const emailOk = where.email ? invitation.email === where.email : true;
        const clinicOk = where.clinicId ? invitation.clinicId === where.clinicId : true;
        const consumedOk = where.consumedAt === null ? invitation.consumedAt === null : true;
        if (emailOk && clinicOk && consumedOk) {
          this.invitations.set(id, { ...invitation, ...data });
          count += 1;
        }
      }
      return { count };
    },
  };

  async $connect() {
    return undefined;
  }

  /**
   * Minimal transaction support for the test double. Every store is snapshotted
   * before the callback and restored if it throws, so "nothing is persisted if
   * any step fails" stays observable in tests (AC-002, AC-020).
   */
  async $transaction<T>(fn: (tx: MemoryPrisma) => Promise<T>): Promise<T> {
    const snapshot = this.snapshot();
    try {
      return await fn(this);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  private membershipMatches(item: MembershipRecord, where: MembershipWhere): boolean {
    if (where.userId && item.userId !== where.userId) return false;
    if (where.clinicId && item.clinicId !== where.clinicId) return false;
    if (where.organizationId && item.organizationId !== where.organizationId) return false;
    if (where.role && item.role !== where.role) return false;
    if (where.status && item.status !== where.status) return false;
    return true;
  }

  private sortByCreatedAt<T extends { createdAt: Date }>(
    rows: T[],
    orderBy?: { createdAt: 'asc' | 'desc' },
  ): T[] {
    const direction = orderBy?.createdAt === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * direction);
  }

  private pick<T extends object>(row: T, select: Record<string, boolean>): Partial<T> {
    const picked: Partial<T> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) {
        (picked as Record<string, unknown>)[key] = (row as Record<string, unknown>)[key];
      }
    }
    return picked;
  }

  private snapshot(): MemorySnapshot {
    const copy = <T extends object>(map: Map<string, T>): Map<string, T> =>
      new Map([...map].map(([key, value]) => [key, { ...value } as T]));
    return {
      users: copy(this.users),
      refreshTokens: copy(this.refreshTokens),
      resetTokens: copy(this.resetTokens),
      organizations: copy(this.organizations),
      clinics: copy(this.clinics),
      memberships: copy(this.memberships),
      invitations: copy(this.invitations),
      auditLogs: copy(this.auditLogs),
    };
  }

  private restore(snapshot: MemorySnapshot): void {
    this.users = snapshot.users;
    this.refreshTokens = snapshot.refreshTokens;
    this.resetTokens = snapshot.resetTokens;
    this.organizations = snapshot.organizations;
    this.clinics = snapshot.clinics;
    this.memberships = snapshot.memberships;
    this.invitations = snapshot.invitations;
    this.auditLogs = snapshot.auditLogs;
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
