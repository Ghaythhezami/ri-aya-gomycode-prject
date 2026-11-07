import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CAPABILITIES, CAPABILITY_ROLES, type Capability } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user-role.enum';
import { TenantContext, clinicWhere, organizationWhere, type TenantScope } from './tenant-context';
import type { UpdateClinicSettingsDto, WorkingHoursDto } from './dto/clinic-settings.dto';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface WorkingHoursDay {
  open: boolean;
  start: string;
  end: string;
  breaks: { start: string; end: string }[];
}

export type ClinicWorkingHours = Record<Weekday, WorkingHoursDay>;

const day = (open: boolean, start = '08:00', end = '17:00'): WorkingHoursDay => ({
  open,
  start,
  end,
  breaks: [],
});

/** The prototype's default week: Mon-Thu full day, Fri short day, weekend closed. */
export const DEFAULT_WORKING_HOURS: ClinicWorkingHours = {
  monday: day(true),
  tuesday: day(true),
  wednesday: day(true),
  thursday: day(true),
  friday: day(true, '08:00', '13:00'),
  saturday: day(false),
  sunday: day(false),
};

export interface ClinicSettingsView {
  id: string;
  name: string;
  address: string;
  contactEmail: string;
  phone: string;
  defaultLanguage: string;
  timezone: string;
  currency: string;
  workingHours: ClinicWorkingHours;
}

export type RoleAccessLevel = 'full' | 'operations' | 'limited';

export interface RoleView {
  id: string;
  name: string;
  baseRole: UserRole;
  isSystem: boolean;
  editable: boolean;
  accessLevel: RoleAccessLevel;
  permissions: Capability[];
  users: number;
}

/** Access-level labels shown next to the role's name in the settings table. */
const ROLE_ACCESS_LEVEL: Record<UserRole, RoleAccessLevel> = {
  [UserRole.SUPER_ADMIN]: 'full',
  [UserRole.CLINIC_ADMIN]: 'operations',
  [UserRole.DOCTOR]: 'limited',
  [UserRole.RECEPTIONIST]: 'limited',
};

const SYSTEM_ROLES = Object.values(UserRole);

/** The capabilities a built-in role grants, in matrix order. */
function capabilitiesFor(role: UserRole): Capability[] {
  return CAPABILITIES.filter((capability) => CAPABILITY_ROLES[capability].includes(role));
}

/** The membership a caller targets, plus whether their role is organization-wide. */
export interface SuspendMembershipRequest {
  membershipId: string;
  /** True for SUPER_ADMIN: the target may live in any clinic of the organization. */
  organizationWide: boolean;
}

export interface MembershipView {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  /** IANA zone the UI formats this clinic's timestamps in (BP-013). */
  clinicTimezone: string;
  role: UserRole;
}

/**
 * Reads and writes the tenancy hierarchy. Every query that touches clinic data
 * must go through a scope obtained here, never through a caller-supplied id.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    // Optional so the pre-existing scoping/timezone unit tests, which construct
    // this service directly with two arguments, keep compiling. Nest always
    // injects it (AuditModule is global), so runtime behaviour is unchanged.
    private readonly audit?: AuditService,
  ) {}

  /** The clinic-scoped filter for a query in the current request. */
  clinicFilter(): { organizationId: string; clinicId: string } {
    return clinicWhere(this.tenant.get());
  }

  /** The organization-wide filter for a SUPER_ADMIN action. */
  organizationFilter(): { organizationId: string } {
    return organizationWhere(this.tenant.get());
  }

  /**
   * Active workspaces for a user, used by the clinic switcher (FR-032).
   *
   * A SUPER_ADMIN is organization-wide, so every clinic of an organization where
   * they hold that role is a valid workspace even when no membership row exists
   * for it. Those clinics are synthesized from the organization's clinic list so
   * the switcher never hides a clinic the caller can actually open.
   */
  async listMemberships(userId: string): Promise<MembershipView[]> {
    const rows = await this.prisma.userMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { clinic: true, organization: true },
      orderBy: { createdAt: 'asc' },
    });

    const views: MembershipView[] = rows.map((row) => ({
      membershipId: row.id,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      clinicId: row.clinicId,
      clinicName: row.clinic.name,
      clinicTimezone: row.clinic.timezone,
      role: row.role as UserRole,
    }));

    const seen = new Set(views.map((view) => view.clinicId));
    const superAdminOrgs = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (row.role === UserRole.SUPER_ADMIN) {
        superAdminOrgs.set(row.organizationId, row);
      }
    }

    for (const [organizationId, membership] of superAdminOrgs) {
      const clinics = await this.prisma.clinic.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
      for (const clinic of clinics) {
        if (seen.has(clinic.id)) continue;
        seen.add(clinic.id);
        views.push({
          membershipId: membership.id,
          organizationId,
          organizationName: membership.organization.name,
          clinicId: clinic.id,
          clinicName: clinic.name,
          clinicTimezone: clinic.timezone,
          role: UserRole.SUPER_ADMIN,
        });
      }
    }

    return views;
  }

  /**
   * Resolve the scope for a specific clinic. Returns null when the user holds
   * no ACTIVE membership there — callers must treat that as 403, never as
   * "fall back to another clinic" (FR-012, AC-014).
   */
  async resolveScope(userId: string, clinicId: string): Promise<TenantScope | null> {
    const membership = await this.prisma.userMembership.findFirst({
      where: { userId, clinicId, status: 'ACTIVE' },
    });
    if (membership) {
      return {
        userId,
        organizationId: membership.organizationId,
        clinicId: membership.clinicId,
        role: membership.role as UserRole,
        membershipId: membership.id,
      };
    }

    // A SUPER_ADMIN needs no per-clinic membership row: their role is
    // organization-wide, so any clinic inside that organization is reachable.
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) return null;

    const superAdmin = await this.prisma.userMembership.findFirst({
      where: {
        userId,
        organizationId: clinic.organizationId,
        role: UserRole.SUPER_ADMIN,
        status: 'ACTIVE',
      },
    });
    if (!superAdmin) return null;

    return {
      userId,
      organizationId: clinic.organizationId,
      clinicId: clinic.id,
      role: UserRole.SUPER_ADMIN,
      membershipId: superAdmin.id,
    };
  }

  /** The user's default scope: their first active membership. */
  async resolveDefaultScope(userId: string): Promise<TenantScope | null> {
    const membership = await this.prisma.userMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) return null;

    return {
      userId,
      organizationId: membership.organizationId,
      clinicId: membership.clinicId,
      role: membership.role as UserRole,
      membershipId: membership.id,
    };
  }

  /**
   * Members of the active clinic for the staff directory (FR-048, NFR-019).
   *
   * Scoped with `clinicWhere`, so a caller reads only their own clinic, and
   * bounded by a page so the directory never loads every membership at once.
   * `lastLoginAt` is read from the identity, never newly modelled here.
   */
  async listClinicMembers(scope: TenantScope, page = 1, pageSize = 25) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = Math.max(page - 1, 0) * take;

    const where = clinicWhere(scope);
    const rows = await this.prisma.userMembership.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take,
      skip,
    });
    const total = await this.prisma.userMembership.count({ where });

    const items = rows.map((row) => ({
      membershipId: row.id,
      userId: row.userId,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      email: row.user.email,
      role: row.role as UserRole,
      status: row.status,
      lastLoginAt: row.user.lastLoginAt,
    }));

    return { items, total, page, pageSize: take };
  }

  /**
   * Create another clinic in the caller's active organization and give the
   * creator a membership there, so the new clinic appears in the switcher as
   * soon as it is created.
   */
  async createClinic(
    scope: TenantScope,
    input: { name: string },
    actorUserId: string,
  ): Promise<MembershipView> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException({
        code: 'CLINIC_NAME_REQUIRED',
        message: 'A clinic name is required',
      });
    }

    const [organization, source] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: scope.organizationId } }),
      this.prisma.clinic.findUnique({ where: { id: scope.clinicId } }),
    ]);
    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          organizationId: scope.organizationId,
          name,
          // A new clinic inherits the working defaults of the clinic that
          // created it, so schedules and amounts do not silently change zone.
          timezone: source?.timezone ?? 'UTC',
          currency: source?.currency ?? 'USD',
        },
      });
      const membership = await tx.userMembership.create({
        data: {
          userId: actorUserId,
          organizationId: scope.organizationId,
          clinicId: clinic.id,
          role: scope.role,
          status: 'ACTIVE',
        },
      });
      await this.audit?.record(tx, {
        actorUserId,
        action: 'create',
        entity: 'clinic',
        entityId: clinic.id,
        after: { name: clinic.name },
        organizationId: scope.organizationId,
        clinicId: clinic.id,
      });
      return { clinic, membership };
    });

    return {
      membershipId: result.membership.id,
      organizationId: scope.organizationId,
      organizationName: organization.name,
      clinicId: result.clinic.id,
      clinicName: result.clinic.name,
      clinicTimezone: result.clinic.timezone,
      role: scope.role,
    };
  }

  /**
   * Read the active clinic's settings (BP-035).
   *
   * The clinic id comes from the verified scope, never from the request, so an
   * admin can only read the clinic they are currently working in.
   */
  async getClinicSettings(scope: TenantScope): Promise<ClinicSettingsView> {
    const clinic = await this.findActiveClinic(scope);
    return this.clinicSettingsView(clinic);
  }

  /**
   * Update the active clinic's settings (BP-035).
   *
   * Every field is optional so the clinic-information and working-hours forms
   * can save independently. The change and its audit row share one transaction.
   */
  async updateClinicSettings(
    scope: TenantScope,
    input: UpdateClinicSettingsDto,
    actorUserId: string,
  ): Promise<ClinicSettingsView> {
    const clinic = await this.findActiveClinic(scope);
    const data: Prisma.ClinicUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException({
          code: 'CLINIC_NAME_REQUIRED',
          message: 'A clinic name is required',
        });
      }
      data.name = name;
    }

    if (input.address !== undefined) data.address = input.address?.trim() || null;
    if (input.contactEmail !== undefined) {
      data.contactEmail = input.contactEmail?.trim().toLowerCase() || null;
    }
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.defaultLanguage !== undefined) data.defaultLanguage = input.defaultLanguage;

    if (input.timezone !== undefined) {
      if (!this.isValidTimeZone(input.timezone)) {
        throw new BadRequestException({
          code: 'INVALID_TIMEZONE',
          message: 'Choose a valid time zone',
        });
      }
      data.timezone = input.timezone;
    }

    if (input.workingHours !== undefined) {
      data.workingHours = this.normalizeWorkingHoursInput(
        input.workingHours,
      ) as unknown as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) return this.clinicSettingsView(clinic);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinic.update({ where: { id: clinic.id }, data });
      await this.audit?.record(tx, {
        actorUserId,
        action: 'update',
        entity: 'clinic',
        entityId: clinic.id,
        before: this.clinicSettingsView(clinic),
        after: this.clinicSettingsView(row),
        organizationId: scope.organizationId,
        clinicId: clinic.id,
      });
      return row;
    });

    return this.clinicSettingsView(updated);
  }

  /**
   * Built-in and custom roles for the active clinic (BP-035).
   *
   * Built-in roles are derived from the shared capability matrix and cannot be
   * edited. Custom roles are persisted per clinic and their permissions must
   * stay inside their base role's ceiling.
   */
  async listRoles(scope: TenantScope): Promise<RoleView[]> {
    const system = await Promise.all(
      SYSTEM_ROLES.map(async (role) => ({
        id: role,
        name: role,
        baseRole: role,
        isSystem: true,
        editable: false,
        accessLevel: ROLE_ACCESS_LEVEL[role],
        permissions: capabilitiesFor(role),
        users: await this.prisma.userMembership.count({
          where: { clinicId: scope.clinicId, role, status: 'ACTIVE' },
        }),
      })),
    );

    const customRows = await this.prisma.role.findMany({
      where: { organizationId: scope.organizationId, clinicId: scope.clinicId },
      orderBy: { createdAt: 'asc' },
    });

    const custom = customRows.map((row) => this.roleView(row));
    return [...system, ...custom];
  }

  async createRole(
    scope: TenantScope,
    input: CreateRoleDto,
    actorUserId: string,
  ): Promise<RoleView> {
    await this.findActiveClinic(scope);
    const name = input.name.trim();
    const permissions = this.validateRolePermissions(input.baseRole, input.permissions);

    const existing = await this.prisma.role.findMany({
      where: { organizationId: scope.organizationId, clinicId: scope.clinicId },
    });
    if (existing.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException({
        code: 'ROLE_NAME_TAKEN',
        message: 'A role with this name already exists in this clinic',
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.role.create({
        data: {
          organizationId: scope.organizationId,
          clinicId: scope.clinicId,
          name,
          baseRole: input.baseRole,
          permissions: permissions as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit?.record(tx, {
        actorUserId,
        action: 'create',
        entity: 'role',
        entityId: row.id,
        after: { name, baseRole: input.baseRole, permissions },
        organizationId: scope.organizationId,
        clinicId: scope.clinicId,
      });
      return row;
    });

    return this.roleView(created);
  }

  async updateRole(
    scope: TenantScope,
    roleId: string,
    input: UpdateRoleDto,
    actorUserId: string,
  ): Promise<RoleView> {
    const current = await this.findCustomRole(scope, roleId);
    const name = (input.name ?? current.name).trim();
    const baseRole = input.baseRole ?? (current.baseRole as UserRole);
    const permissions =
      input.permissions !== undefined
        ? this.validateRolePermissions(baseRole, input.permissions)
        : this.parsePermissions(current.permissions);

    const siblings = await this.prisma.role.findMany({
      where: { organizationId: scope.organizationId, clinicId: scope.clinicId },
    });
    if (
      siblings.some((row) => row.id !== current.id && row.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new ConflictException({
        code: 'ROLE_NAME_TAKEN',
        message: 'A role with this name already exists in this clinic',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.role.update({
        where: { id: current.id },
        data: {
          name,
          baseRole,
          permissions: permissions as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit?.record(tx, {
        actorUserId,
        action: 'update',
        entity: 'role',
        entityId: row.id,
        before: {
          name: current.name,
          baseRole: current.baseRole,
          permissions: this.parsePermissions(current.permissions),
        },
        after: { name, baseRole, permissions },
        organizationId: scope.organizationId,
        clinicId: scope.clinicId,
      });
      return row;
    });

    return this.roleView(updated);
  }

  async deleteRole(scope: TenantScope, roleId: string, actorUserId: string): Promise<void> {
    const current = await this.findCustomRole(scope, roleId);
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: current.id } });
      await this.audit?.record(tx, {
        actorUserId,
        action: 'delete',
        entity: 'role',
        entityId: current.id,
        before: {
          name: current.name,
          baseRole: current.baseRole,
          permissions: this.parsePermissions(current.permissions),
        },
        organizationId: scope.organizationId,
        clinicId: scope.clinicId,
      });
    });
  }

  private async findCustomRole(scope: TenantScope, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: scope.organizationId,
        clinicId: scope.clinicId,
      },
    });
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found' });
    }
    return role;
  }

  private roleView(row: {
    id: string;
    name: string;
    baseRole: UserRole;
    permissions: unknown;
  }): RoleView {
    const baseRole = row.baseRole as UserRole;
    return {
      id: row.id,
      name: row.name,
      baseRole,
      isSystem: false,
      editable: true,
      accessLevel: ROLE_ACCESS_LEVEL[baseRole],
      permissions: this.parsePermissions(row.permissions),
      users: 0,
    };
  }

  /** A custom role may not grant beyond the built-in role it is based on. */
  private validateRolePermissions(baseRole: UserRole, permissions: string[]): Capability[] {
    const allowed = new Set(capabilitiesFor(baseRole));
    const unique = [...new Set(permissions)] as Capability[];
    const invalid = unique.filter((permission) => !allowed.has(permission));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_PERMISSIONS',
        message: `These permissions are outside the ${baseRole} role: ${invalid.join(', ')}`,
      });
    }
    return unique;
  }

  private parsePermissions(value: unknown): Capability[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (item): item is Capability =>
            typeof item === 'string' && CAPABILITIES.includes(item as Capability),
        ),
      ),
    ];
  }

  /** Resolve the active clinic inside the caller's organization. */
  private async findActiveClinic(scope: TenantScope) {
    const clinic = await this.prisma.clinic.findFirst({
      // Clinic is the tenant root: its own id IS the clinic id, so spreading
      // `clinicWhere` (which adds a clinicId column) is invalid here.
      where: { id: scope.clinicId, organizationId: scope.organizationId },
    });
    if (!clinic) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }
    return clinic;
  }

  private clinicSettingsView(clinic: {
    id: string;
    name: string;
    address: string | null;
    contactEmail: string | null;
    phone: string | null;
    defaultLanguage: string;
    timezone: string;
    currency: string;
    workingHours: unknown;
  }): ClinicSettingsView {
    return {
      id: clinic.id,
      name: clinic.name,
      address: clinic.address ?? '',
      contactEmail: clinic.contactEmail ?? '',
      phone: clinic.phone ?? '',
      defaultLanguage: clinic.defaultLanguage,
      timezone: clinic.timezone,
      currency: clinic.currency,
      workingHours: this.normalizeWorkingHours(clinic.workingHours),
    };
  }

  /**
   * Coerce stored JSON into a complete week. A malformed or missing day falls
   * back to the prototype's default instead of breaking the settings screen.
   */
  private normalizeWorkingHours(value: unknown): ClinicWorkingHours {
    const source =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const result = {} as ClinicWorkingHours;
    for (const weekday of WEEKDAYS) {
      const fallback = DEFAULT_WORKING_HOURS[weekday];
      const candidate = source[weekday];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        result[weekday] = { ...fallback, breaks: [] };
        continue;
      }

      const record = candidate as Record<string, unknown>;
      const breaks = Array.isArray(record.breaks)
        ? record.breaks
            .filter(
              (item): item is { start: string; end: string } =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as { start?: unknown }).start === 'string' &&
                typeof (item as { end?: unknown }).end === 'string' &&
                TIME.test((item as { start: string }).start) &&
                TIME.test((item as { end: string }).end),
            )
            .map((item) => ({ start: item.start, end: item.end }))
        : [];

      result[weekday] = {
        open: typeof record.open === 'boolean' ? record.open : fallback.open,
        start:
          typeof record.start === 'string' && TIME.test(record.start)
            ? record.start
            : fallback.start,
        end: typeof record.end === 'string' && TIME.test(record.end) ? record.end : fallback.end,
        breaks,
      };
    }
    return result;
  }

  /** Validate the submitted week before it is stored. */
  private normalizeWorkingHoursInput(input: WorkingHoursDto): ClinicWorkingHours {
    for (const weekday of WEEKDAYS) {
      const value = input[weekday];
      if (!value.open) continue;
      if (value.start >= value.end) this.invalidWorkingHours();

      for (const pause of value.breaks) {
        if (pause.start >= pause.end || pause.start < value.start || pause.end > value.end) {
          this.invalidWorkingHours();
        }
      }

      // A later break that starts before the previous one ends is a duplicate
      // or an overlap; neither is a real second break.
      const sortedBreaks = [...value.breaks].sort((left, right) =>
        left.start.localeCompare(right.start),
      );
      for (let index = 1; index < sortedBreaks.length; index += 1) {
        if (sortedBreaks[index].start < sortedBreaks[index - 1].end) {
          this.invalidBreaks();
        }
      }
    }
    return input as ClinicWorkingHours;
  }

  private invalidWorkingHours(): never {
    throw new BadRequestException({
      code: 'INVALID_WORKING_HOURS',
      message: 'Working hours must have an end time after the start time',
    });
  }

  private invalidBreaks(): never {
    throw new BadRequestException({
      code: 'INVALID_BREAKS',
      message: 'Breaks cannot repeat or overlap',
    });
  }

  private isValidTimeZone(value: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Aggregates the organization's activity across every clinic for the overview
   * page. Counts are computed once per clinic, so the page never loads a full
   * patient or appointment list just to render a headline.
   */
  async organizationOverview(scope: TenantScope) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: scope.organizationId },
    });
    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      });
    }

    const clinics = await this.prisma.clinic.findMany({
      where: { organizationId: scope.organizationId },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const clinicStats = await Promise.all(
      clinics.map(async (clinic) => {
        const [members, patients, doctors, todayAppointments, upcomingAppointments] =
          await Promise.all([
            this.prisma.userMembership.count({
              where: { clinicId: clinic.id, status: 'ACTIVE' },
            }),
            this.prisma.patient.count({ where: { clinicId: clinic.id } }),
            this.prisma.doctor.count({ where: { clinicId: clinic.id, isActive: true } }),
            this.prisma.appointment.count({
              where: {
                clinicId: clinic.id,
                startsAt: { gte: startOfDay, lt: endOfDay },
                status: { not: 'CANCELLED' },
              },
            }),
            this.prisma.appointment.count({
              where: {
                clinicId: clinic.id,
                startsAt: { gte: now },
                status: { in: ['SCHEDULED', 'CONFIRMED'] },
              },
            }),
          ]);

        return {
          id: clinic.id,
          name: clinic.name,
          timezone: clinic.timezone,
          members,
          patients,
          doctors,
          todayAppointments,
          upcomingAppointments,
        };
      }),
    );

    const totals = clinicStats.reduce(
      (acc, clinic) => ({
        clinics: acc.clinics + 1,
        members: acc.members + clinic.members,
        patients: acc.patients + clinic.patients,
        doctors: acc.doctors + clinic.doctors,
        todayAppointments: acc.todayAppointments + clinic.todayAppointments,
        upcomingAppointments: acc.upcomingAppointments + clinic.upcomingAppointments,
      }),
      {
        clinics: 0,
        members: 0,
        patients: 0,
        doctors: 0,
        todayAppointments: 0,
        upcomingAppointments: 0,
      },
    );

    const pendingInvitations = await this.prisma.invitation.count({
      where: { organizationId: scope.organizationId, status: 'PENDING' },
    });

    return {
      organization: { id: organization.id, name: organization.name },
      totals: { ...totals, pendingInvitations },
      clinics: clinicStats,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Suspend a membership (FR-018). Audit history is untouched (FR-020).
   *
   * The membership id arrives from the request path, so the caller supplies the
   * target: it MUST be resolved inside the caller's own tenant. A membership in
   * another organization is reported as not found, never as forbidden, so the
   * route does not disclose that it exists.
   */
  async suspendMembership(request: SuspendMembershipRequest): Promise<void> {
    const membership = await this.findMembershipInTenant(request);
    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Membership not found',
      });
    }

    // Refuse to leave an organization with zero active SUPER_ADMINs (FR-029).
    if (membership.role === UserRole.SUPER_ADMIN) {
      const remaining = await this.prisma.userMembership.count({
        where: {
          organizationId: membership.organizationId,
          role: UserRole.SUPER_ADMIN,
          status: 'ACTIVE',
          id: { not: membership.id },
        },
      });
      if (remaining === 0) {
        throw new NotFoundException({
          code: 'LAST_SUPER_ADMIN',
          message: 'An organization must keep at least one active super admin',
        });
      }
    }

    await this.prisma.userMembership.update({
      where: { id: membership.id },
      data: { status: 'SUSPENDED' },
    });
  }

  /**
   * Locate a membership inside the caller's tenant, or return null. When
   * `clinicId` is null the caller is organization-wide and may reach any clinic
   * in their organization; otherwise the membership must belong to that clinic.
   */
  private async findMembershipInTenant(
    request: SuspendMembershipRequest,
  ): Promise<{ id: string; userId: string; role: string; organizationId: string } | null> {
    const filter = request.organizationWide ? this.organizationFilter() : this.clinicFilter();

    return this.prisma.userMembership.findFirst({
      where: { id: request.membershipId, ...filter },
      select: { id: true, userId: true, role: true, organizationId: true },
    });
  }

  /**
   * Change a member's role within the caller's scope (FR-045, AC-058..AC-060).
   *
   * The membership id arrives from the request path, so it MUST resolve inside
   * the caller's tenant: a foreign membership is reported as not found, never as
   * forbidden. A SUPER_ADMIN is organization-wide; every other role acts only
   * within their own clinic. A change that would leave the organization with zero
   * active SUPER_ADMINs is refused by the same invariant suspension uses (FR-029).
   * The role change and its audit row share one transaction (AC-060).
   */
  async changeMembershipRole(request: {
    membershipId: string;
    role: UserRole;
    actorUserId: string;
    organizationWide: boolean;
  }): Promise<void> {
    const membership = await this.findMembershipInTenant(request);
    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Membership not found',
      });
    }

    // A caller never changes their own role: a super admin may change the roles of
    // others, but must not be able to demote or re-scope themselves.
    if (membership.userId === request.actorUserId) {
      throw new ForbiddenException({
        code: 'SELF_ROLE_CHANGE',
        message: 'You cannot change your own role',
      });
    }

    // Only a SUPER_ADMIN can grant or revoke the organization-wide role.
    if (
      !request.organizationWide &&
      (request.role === UserRole.SUPER_ADMIN || membership.role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Only a super admin can manage the super admin role',
      });
    }

    if (membership.role === request.role) {
      return;
    }

    // Demoting the last SUPER_ADMIN would orphan the organization (FR-029, AC-059).
    if (membership.role === UserRole.SUPER_ADMIN && request.role !== UserRole.SUPER_ADMIN) {
      const remaining = await this.prisma.userMembership.count({
        where: {
          organizationId: membership.organizationId,
          role: UserRole.SUPER_ADMIN,
          status: 'ACTIVE',
          id: { not: membership.id },
        },
      });
      if (remaining === 0) {
        throw new ConflictException({
          code: 'LAST_SUPER_ADMIN',
          message: 'An organization must keep at least one active super admin',
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userMembership.update({
        where: { id: membership.id },
        data: { role: request.role },
      });
      await this.audit?.record(tx, {
        actorUserId: request.actorUserId,
        action: 'update',
        entity: 'user_membership',
        entityId: membership.id,
        before: { role: membership.role },
        after: { role: request.role },
      });
    });
  }
}
