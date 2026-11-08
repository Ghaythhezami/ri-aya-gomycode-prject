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
  contactEmail: string | null;
  phone: string | null;
  defaultLanguage: PreferredLocale;
  workingHours: Record<string, unknown> | null;
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
  /** Persisted lifecycle; EXPIRED is derived at read time, never stored (FR-042). */
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  /** Recorded outcome of the invitation email send (FR-041). */
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  /** Provider error text when the send failed; null otherwise. */
  deliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
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

interface RoleRecord {
  id: string;
  organizationId: string;
  clinicId: string;
  name: string;
  baseRole: UserRole;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

type AppointmentStatusValue =
  'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface PatientRecord {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone: string;
  email: string | null;
  gender: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DoctorRecord {
  id: string;
  clinicId: string;
  userId: string | null;
  specialty: string;
  licenseNumber: string | null;
  consultationMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AppointmentRecord {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatusValue;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MembershipWhere = {
  /**
   * Membership id. May be a plain value or a Prisma `not` filter, as used by
   * the last-SUPER_ADMIN count. Omitting the id here made every id-scoped
   * lookup match the first row of the tenant instead of the requested one.
   */
  id?: string | { not?: string };
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
  roles: Map<string, RoleRecord>;
  auditLogs: Map<string, AuditLogRecord>;
  patients: Map<string, PatientRecord>;
  doctors: Map<string, DoctorRecord>;
  appointments: Map<string, AppointmentRecord>;
}

export class MemoryPrisma {
  private users = new Map<string, UserRecord>();
  private refreshTokens = new Map<string, RefreshRecord>();
  private resetTokens = new Map<string, ResetRecord>();
  private organizations = new Map<string, OrganizationRecord>();
  private clinics = new Map<string, ClinicRecord>();
  private memberships = new Map<string, MembershipRecord>();
  private invitations = new Map<string, InvitationRecord>();
  private roles = new Map<string, RoleRecord>();
  private auditLogs = new Map<string, AuditLogRecord>();
  private patients = new Map<string, PatientRecord>();
  private doctors = new Map<string, DoctorRecord>();
  private appointments = new Map<string, AppointmentRecord>();

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
        role: (data.role as UserRole) ?? null,
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
        contactEmail?: string | null;
        phone?: string | null;
        defaultLanguage?: PreferredLocale;
        workingHours?: Record<string, unknown> | null;
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
        contactEmail: data.contactEmail ?? null,
        phone: data.phone ?? null,
        defaultLanguage: data.defaultLanguage ?? 'en',
        workingHours: data.workingHours ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.clinics.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.clinics.get(where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<
        Pick<
          ClinicRecord,
          | 'name'
          | 'timezone'
          | 'currency'
          | 'address'
          | 'contactEmail'
          | 'phone'
          | 'defaultLanguage'
          | 'workingHours'
        >
      >;
    }) => {
      const current = this.clinics.get(where.id);
      if (!current) throw new Error('Clinic not found');
      const next = { ...current, ...data, updatedAt: new Date() };
      this.clinics.set(next.id, next);
      return next;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { organizationId?: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const matches = [...this.clinics.values()].filter(
        (item) => !where?.organizationId || item.organizationId === where.organizationId,
      );
      const direction = orderBy?.createdAt === 'desc' ? -1 : 1;
      return matches.sort((left, right) => {
        const delta = left.createdAt.getTime() - right.createdAt.getTime();
        return delta === 0 ? 0 : delta * direction;
      });
    },
    findFirst: async ({ where }: { where: { id?: string; organizationId?: string } }) => {
      return (
        [...this.clinics.values()].find(
          (item) =>
            (!where.id || item.id === where.id) &&
            (!where.organizationId || item.organizationId === where.organizationId),
        ) ?? null
      );
    },
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
      select,
    }: {
      where: MembershipWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: Partial<Record<keyof MembershipRecord, boolean>>;
    }) => {
      const matches = [...this.memberships.values()].filter((item) =>
        this.membershipMatches(item, where),
      );
      const found = this.sortByCreatedAt(matches, orderBy)[0] ?? null;
      if (!found) return null;
      return select ? this.pick(found, select as Record<string, boolean>) : found;
    },
    findMany: async ({
      where,
      include,
      orderBy,
      take,
      skip,
    }: {
      where: MembershipWhere;
      include?: { clinic?: boolean; organization?: boolean; user?: boolean };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
      skip?: number;
    }) => {
      const matches = [...this.memberships.values()].filter((item) =>
        this.membershipMatches(item, where),
      );
      const sorted = this.sortByCreatedAt(matches, orderBy);
      const start = skip ?? 0;
      const windowed = take != null ? sorted.slice(start, start + take) : sorted.slice(start);
      return windowed.map((item) => ({
        ...item,
        clinic: include?.clinic ? (this.clinics.get(item.clinicId) ?? null) : undefined,
        organization: include?.organization
          ? (this.organizations.get(item.organizationId) ?? null)
          : undefined,
        user: include?.user ? (this.users.get(item.userId) ?? null) : undefined,
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
    count: async ({ where }: { where: MembershipWhere }) => {
      return [...this.memberships.values()].filter((item) => this.membershipMatches(item, where))
        .length;
    },
  };

  readonly role = {
    create: async ({
      data,
    }: {
      data: {
        organizationId: string;
        clinicId: string;
        name: string;
        baseRole: UserRole;
        permissions: string[];
      };
    }) => {
      const now = new Date();
      const row: RoleRecord = {
        id: randomUUID(),
        organizationId: data.organizationId,
        clinicId: data.clinicId,
        name: data.name,
        baseRole: data.baseRole,
        permissions: [...data.permissions],
        createdAt: now,
        updatedAt: now,
      };
      this.roles.set(row.id, row);
      return row;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { organizationId?: string; clinicId?: string };
      orderBy?: { createdAt?: 'asc' | 'desc' };
    } = {}) => {
      const matches = [...this.roles.values()].filter(
        (item) =>
          (!where?.organizationId || item.organizationId === where.organizationId) &&
          (!where?.clinicId || item.clinicId === where.clinicId),
      );
      const direction = orderBy?.createdAt === 'desc' ? -1 : 1;
      return matches.sort(
        (left, right) => (left.createdAt.getTime() - right.createdAt.getTime()) * direction,
      );
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; organizationId?: string; clinicId?: string };
    }) => {
      return (
        [...this.roles.values()].find(
          (item) =>
            (!where.id || item.id === where.id) &&
            (!where.organizationId || item.organizationId === where.organizationId) &&
            (!where.clinicId || item.clinicId === where.clinicId),
        ) ?? null
      );
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { name?: string; baseRole?: UserRole; permissions?: string[] };
    }) => {
      const current = this.roles.get(where.id);
      if (!current) throw new Error('Role not found');
      const next: RoleRecord = {
        ...current,
        ...data,
        permissions: data.permissions ? [...data.permissions] : current.permissions,
        updatedAt: new Date(),
      };
      this.roles.set(next.id, next);
      return next;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = this.roles.get(where.id);
      if (!current) throw new Error('Role not found');
      this.roles.delete(where.id);
      return current;
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
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { entity?: string; entityId?: string; actorUserId?: string; clinicId?: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const matches = [...this.auditLogs.values()].filter((row) => {
        if (where?.entity && row.entity !== where.entity) return false;
        if (where?.entityId && row.entityId !== where.entityId) return false;
        if (where?.actorUserId && row.actorUserId !== where.actorUserId) return false;
        if (where?.clinicId && row.clinicId !== where.clinicId) return false;
        return true;
      });
      return this.sortByCreatedAt(matches, orderBy);
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
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        deliveryStatus?: 'PENDING' | 'SENT' | 'FAILED';
        deliveryError?: string | null;
      };
    }) => {
      const now = new Date();
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
        status: data.status ?? 'PENDING',
        deliveryStatus: data.deliveryStatus ?? 'PENDING',
        deliveryError: data.deliveryError ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.invitations.set(row.id, row);
      return row;
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: { id?: string; tokenHash?: string };
      include?: { clinic?: boolean; organization?: boolean };
    }) => {
      let found = null;
      if (where.id) found = this.invitations.get(where.id) ?? null;
      else if (where.tokenHash) {
        found =
          [...this.invitations.values()].find((item) => item.tokenHash === where.tokenHash) ?? null;
      }
      if (!found) return null;
      return {
        ...found,
        clinic: include?.clinic ? (this.clinics.get(found.clinicId) ?? null) : undefined,
        organization: include?.organization
          ? (this.organizations.get(found.organizationId) ?? null)
          : undefined,
      };
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        id?: string;
        clinicId?: string;
        organizationId?: string;
        email?: string;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        consumedAt?: Date | null;
        expiresAt?: { gt?: Date };
      };
      include?: { clinic?: boolean; organization?: boolean };
    }) => {
      const found = this.invitationMatches(where)[0] ?? null;
      if (!found) return null;
      return {
        ...found,
        clinic: include?.clinic ? (this.clinics.get(found.clinicId) ?? null) : undefined,
        organization: include?.organization
          ? (this.organizations.get(found.organizationId) ?? null)
          : undefined,
      };
    },
    findMany: async ({
      where,
      select,
      orderBy,
      take,
      skip,
    }: {
      where: {
        clinicId?: string;
        organizationId?: string;
        email?: string;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        consumedAt?: Date | null;
        expiresAt?: { gt?: Date };
      };
      select?: Record<string, boolean>;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
      skip?: number;
    }) => {
      const rows = this.sortByCreatedAt(this.invitationMatches(where), orderBy);
      const start = skip ?? 0;
      const windowed = take != null ? rows.slice(start, start + take) : rows.slice(start);
      return select ? windowed.map((row) => this.pick(row, select)) : windowed;
    },
    count: async ({
      where,
    }: {
      where: {
        clinicId?: string;
        organizationId?: string;
        email?: string;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        consumedAt?: Date | null;
        expiresAt?: { gt?: Date };
      };
    }) => {
      return this.invitationMatches(where).length;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        consumedAt?: Date | null;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        tokenHash?: string;
        expiresAt?: Date;
        deliveryStatus?: 'PENDING' | 'SENT' | 'FAILED';
        deliveryError?: string | null;
      };
    }) => {
      const current = this.invitations.get(where.id);
      if (!current) throw new Error('Invitation not found');
      const next = { ...current, ...data, updatedAt: new Date() };
      this.invitations.set(where.id, next);
      return next;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        email?: string;
        clinicId?: string;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
        consumedAt?: Date | null;
      };
      data: {
        consumedAt?: Date | null;
        status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
      };
    }) => {
      let count = 0;
      for (const [id, invitation] of this.invitations) {
        const emailOk = where.email ? invitation.email === where.email : true;
        const clinicOk = where.clinicId ? invitation.clinicId === where.clinicId : true;
        const consumedOk = where.consumedAt === null ? invitation.consumedAt === null : true;
        const statusOk = where.status ? invitation.status === where.status : true;
        if (emailOk && clinicOk && consumedOk && statusOk) {
          this.invitations.set(id, { ...invitation, ...data, updatedAt: new Date() });
          count += 1;
        }
      }
      return { count };
    },
  };

  /** Shared invitation predicate for findMany/findFirst/count (mirrors the Prisma filters). */
  private invitationMatches(where: {
    id?: string;
    clinicId?: string;
    organizationId?: string;
    email?: string;
    status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
    consumedAt?: Date | null;
    expiresAt?: { gt?: Date };
  }): InvitationRecord[] {
    return [...this.invitations.values()].filter((item) => {
      if (where.id && item.id !== where.id) return false;
      if (where.clinicId && item.clinicId !== where.clinicId) return false;
      if (where.organizationId && item.organizationId !== where.organizationId) return false;
      if (where.email && item.email !== where.email) return false;
      if (where.status && item.status !== where.status) return false;
      if (where.consumedAt === null && item.consumedAt !== null) return false;
      if (where.expiresAt?.gt && item.expiresAt.getTime() <= where.expiresAt.gt.getTime()) {
        return false;
      }
      return true;
    });
  }

  readonly patient = {
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        clinicId: string;
        firstName: string;
        lastName: string;
        dateOfBirth: Date;
        phone: string;
        email?: string | null;
        gender?: string | null;
      };
    }) => {
      const now = new Date();
      const row: PatientRecord = {
        id: data.id ?? randomUUID(),
        clinicId: data.clinicId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phone: data.phone,
        email: data.email ?? null,
        gender: data.gender ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.patients.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.patients.get(where.id) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where?: { clinicId?: string; firstName?: string; lastName?: string; dateOfBirth?: Date };
    } = {}) => {
      return [...this.patients.values()].find((row) => this.patientMatches(row, where)) ?? null;
    },
    findMany: async ({
      where,
      orderBy,
      skip,
      take,
    }: {
      where?: { clinicId?: string; lastName?: string };
      orderBy?: { createdAt?: 'asc' | 'desc'; lastName?: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    } = {}) => {
      let rows = [...this.patients.values()].filter((row) => this.patientMatches(row, where));
      if (orderBy?.lastName) {
        const direction = orderBy.lastName === 'desc' ? -1 : 1;
        rows = rows.sort((a, b) => a.lastName.localeCompare(b.lastName) * direction);
      } else {
        rows = this.sortByCreatedAt(
          rows,
          orderBy?.createdAt ? { createdAt: orderBy.createdAt } : undefined,
        );
      }
      if (skip) rows = rows.slice(skip);
      if (take) rows = rows.slice(0, take);
      return rows;
    },
    count: async ({ where }: { where?: { clinicId?: string } } = {}) => {
      return [...this.patients.values()].filter((row) => this.patientMatches(row, where)).length;
    },
    deleteMany: async ({ where }: { where?: { clinicId?: string } } = {}) => {
      let count = 0;
      for (const [id, row] of this.patients) {
        if (this.patientMatches(row, where)) {
          this.patients.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly doctor = {
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        clinicId: string;
        userId?: string | null;
        specialty: string;
        licenseNumber?: string | null;
        consultationMinutes?: number;
        isActive?: boolean;
      };
    }) => {
      const now = new Date();
      const row: DoctorRecord = {
        id: data.id ?? randomUUID(),
        clinicId: data.clinicId,
        userId: data.userId ?? null,
        specialty: data.specialty,
        licenseNumber: data.licenseNumber ?? null,
        consultationMinutes: data.consultationMinutes ?? 30,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      this.doctors.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.doctors.get(where.id) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where?: { clinicId?: string; userId?: string; specialty?: string; licenseNumber?: string };
    } = {}) => {
      return [...this.doctors.values()].find((row) => this.doctorMatches(row, where)) ?? null;
    },
    findMany: async ({
      where,
      orderBy,
      skip,
      take,
    }: {
      where?: { clinicId?: string; isActive?: boolean; specialty?: string };
      orderBy?: { createdAt?: 'asc' | 'desc'; specialty?: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    } = {}) => {
      let rows = [...this.doctors.values()].filter((row) => this.doctorMatches(row, where));
      if (orderBy?.specialty) {
        const direction = orderBy.specialty === 'desc' ? -1 : 1;
        rows = rows.sort((a, b) => a.specialty.localeCompare(b.specialty) * direction);
      } else {
        rows = this.sortByCreatedAt(
          rows,
          orderBy?.createdAt ? { createdAt: orderBy.createdAt } : undefined,
        );
      }
      if (skip) rows = rows.slice(skip);
      if (take) rows = rows.slice(0, take);
      return rows;
    },
    count: async ({ where }: { where?: { clinicId?: string; isActive?: boolean } } = {}) => {
      return [...this.doctors.values()].filter((row) => this.doctorMatches(row, where)).length;
    },
    deleteMany: async ({ where }: { where?: { clinicId?: string } } = {}) => {
      let count = 0;
      for (const [id, row] of this.doctors) {
        if (this.doctorMatches(row, where)) {
          this.doctors.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly appointment = {
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        clinicId: string;
        patientId: string;
        doctorId: string;
        startsAt: Date;
        endsAt: Date;
        status?: AppointmentStatusValue;
        reason?: string | null;
      };
    }) => {
      const now = new Date();
      const row: AppointmentRecord = {
        id: data.id ?? randomUUID(),
        clinicId: data.clinicId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        status: data.status ?? 'SCHEDULED',
        reason: data.reason ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.appointments.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.appointments.get(where.id) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where?: {
        clinicId?: string;
        patientId?: string;
        doctorId?: string;
        startsAt?: Date;
        status?: AppointmentStatusValue;
      };
    } = {}) => {
      return (
        [...this.appointments.values()].find((row) => this.appointmentMatches(row, where)) ?? null
      );
    },
    /**
     * Doctor day and patient history both read through this method; `startsAt`
     * ordering is what the (doctorId, startsAt) index serves (FR-005).
     */
    findMany: async ({
      where,
      orderBy,
      skip,
      take,
    }: {
      where?: {
        clinicId?: string;
        patientId?: string;
        doctorId?: string;
        status?: AppointmentStatusValue;
        startsAt?: { gte?: Date; lt?: Date; lte?: Date };
      };
      orderBy?: { startsAt?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    } = {}) => {
      let rows = [...this.appointments.values()].filter((row) =>
        this.appointmentMatches(row, where),
      );
      if (orderBy?.startsAt) {
        const direction = orderBy.startsAt === 'desc' ? -1 : 1;
        rows = rows.sort((a, b) => (a.startsAt.getTime() - b.startsAt.getTime()) * direction);
      } else {
        rows = this.sortByCreatedAt(rows, { createdAt: orderBy?.createdAt ?? 'asc' });
      }
      if (skip) rows = rows.slice(skip);
      if (take) rows = rows.slice(0, take);
      return rows;
    },
    count: async ({
      where,
    }: {
      where?: {
        clinicId?: string;
        patientId?: string;
        doctorId?: string;
        status?:
          AppointmentStatusValue | { not?: AppointmentStatusValue; in?: AppointmentStatusValue[] };
        startsAt?: { gte?: Date; lt?: Date; lte?: Date };
      };
    } = {}) => {
      return [...this.appointments.values()].filter((row) => this.appointmentMatches(row, where))
        .length;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        status?: AppointmentStatusValue;
        startsAt?: Date;
        endsAt?: Date;
        reason?: string | null;
      };
    }) => {
      const existing = this.appointments.get(where.id);
      if (!existing) {
        throw new Error(`Appointment ${where.id} not found`);
      }
      const row: AppointmentRecord = {
        ...existing,
        ...data,
        reason: data.reason === undefined ? existing.reason : data.reason,
        updatedAt: new Date(),
      };
      this.appointments.set(row.id, row);
      return row;
    },
    deleteMany: async ({ where }: { where?: { clinicId?: string } } = {}) => {
      let count = 0;
      for (const [id, row] of this.appointments) {
        if (this.appointmentMatches(row, where)) {
          this.appointments.delete(id);
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

  private patientMatches(
    row: PatientRecord,
    where?: { clinicId?: string; firstName?: string; lastName?: string; dateOfBirth?: Date },
  ): boolean {
    if (!where) return true;
    if (where.clinicId && row.clinicId !== where.clinicId) return false;
    if (where.firstName && row.firstName !== where.firstName) return false;
    if (where.lastName && row.lastName !== where.lastName) return false;
    if (where.dateOfBirth && row.dateOfBirth.getTime() !== where.dateOfBirth.getTime())
      return false;
    return true;
  }

  private doctorMatches(
    row: DoctorRecord,
    where?: {
      clinicId?: string;
      userId?: string;
      specialty?: string;
      licenseNumber?: string;
      isActive?: boolean;
    },
  ): boolean {
    if (!where) return true;
    if (where.clinicId && row.clinicId !== where.clinicId) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.specialty && row.specialty !== where.specialty) return false;
    if (where.licenseNumber && row.licenseNumber !== where.licenseNumber) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
    return true;
  }

  private appointmentMatches(
    row: AppointmentRecord,
    where?: {
      clinicId?: string;
      patientId?: string;
      doctorId?: string;
      status?:
        AppointmentStatusValue | { not?: AppointmentStatusValue; in?: AppointmentStatusValue[] };
      startsAt?: Date | { gte?: Date; lt?: Date; lte?: Date };
    },
  ): boolean {
    if (!where) return true;
    if (where.clinicId && row.clinicId !== where.clinicId) return false;
    if (where.patientId && row.patientId !== where.patientId) return false;
    if (where.doctorId && row.doctorId !== where.doctorId) return false;
    if (where.status) {
      if (typeof where.status === 'string') {
        if (row.status !== where.status) return false;
      } else {
        if (where.status.not && row.status === where.status.not) return false;
        if (where.status.in && !where.status.in.includes(row.status)) return false;
      }
    }
    if (where.startsAt instanceof Date) {
      if (row.startsAt.getTime() !== where.startsAt.getTime()) return false;
    } else if (where.startsAt) {
      const { gte, lte, lt } = where.startsAt;
      const value = row.startsAt.getTime();
      if (gte && value < gte.getTime()) return false;
      if (lte && value > lte.getTime()) return false;
      if (lt && value >= lt.getTime()) return false;
    }
    return true;
  }

  private membershipMatches(item: MembershipRecord, where: MembershipWhere): boolean {
    if (typeof where.id === 'string' && item.id !== where.id) return false;
    if (typeof where.id === 'object' && where.id.not && item.id === where.id.not) return false;
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
      roles: new Map(
        [...this.roles].map(([key, value]) => [
          key,
          { ...value, permissions: [...value.permissions] },
        ]),
      ),
      auditLogs: copy(this.auditLogs),
      patients: copy(this.patients),
      doctors: copy(this.doctors),
      appointments: copy(this.appointments),
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
    this.roles = snapshot.roles;
    this.auditLogs = snapshot.auditLogs;
    this.patients = snapshot.patients;
    this.doctors = snapshot.doctors;
    this.appointments = snapshot.appointments;
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
