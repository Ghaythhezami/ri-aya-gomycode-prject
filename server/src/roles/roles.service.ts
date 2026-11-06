import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  LOCKED_ADMIN_CAPABILITIES,
  USER_ROLES,
  defaultCapabilities,
  hasLocalized,
  normalizeLocalized,
  pickLocalized,
  type Capability,
  type LocalizedText,
  type PermissionsMatrix,
  type RoleDto,
  type UserRole,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { SYSTEM_ROLE_DEFAULTS } from '../rbac/system-roles';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import type { AssignRoleDto, CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

export const MAX_CUSTOM_ROLES = 30;
const DESCRIPTION_MAX = 400;
const MAX_EVENT_USERS = 500;
const KNOWN = new Set<string>(CAPABILITIES);

interface RoleRow {
  id: string;
  clinicId: string;
  key: string;
  name: unknown;
  description: unknown;
  baseRole: string;
  capabilities: string[];
  isSystem: boolean;
  createdAt: Date;
}

function unprocessable(message: string, details?: unknown) {
  return new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message, details });
}

function forbidden(message: string, details?: unknown) {
  return new ForbiddenException({ code: 'FORBIDDEN', message, details });
}

function notFound(message: string) {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

function isSystemKey(key: string): key is UserRole {
  return (USER_ROLES as readonly string[]).includes(key);
}

function knownCapabilities(values: readonly string[]): Capability[] {
  return values.filter((c) => KNOWN.has(c)) as Capability[];
}

/** Lower-case ASCII slug from the English (else first filled) name. */
export function roleSlug(name: LocalizedText): string {
  const source = name.en ?? Object.values(name)[0] ?? '';
  const slug = source
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'role';
}

function snapshot(row: {
  key: string;
  name: unknown;
  baseRole: string;
  capabilities: string[];
  isSystem: boolean;
}) {
  return {
    key: row.key,
    name: row.name,
    baseRole: row.baseRole,
    capabilities: [...row.capabilities].sort(),
    isSystem: row.isSystem,
  };
}

/**
 * Custom roles and customised system roles of the active clinic (ADR 0004 section 1).
 * Every query filters by the clinic of the verified scope; every change is audited in the
 * same transaction and bumps the RBAC cache version after commit.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly events: DomainEventsService,
  ) {}

  // ------------------------------------------------------------------ read

  async matrix(locale: string | null): Promise<PermissionsMatrix> {
    const scope = this.tenant.get();
    const [rows, memberships, settings] = await Promise.all([
      this.prisma.clinicRole.findMany({
        where: { clinicId: scope.clinicId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userMembership.findMany({
        where: { clinicId: scope.clinicId },
        select: { role: true, roleId: true },
      }),
      this.prisma.clinicSettings.findUnique({
        where: { clinicId: scope.clinicId },
        select: { defaultLanguage: true },
      }),
    ]);
    const defaultLocale = settings?.defaultLanguage ?? 'en';

    const countFor = (key: string, row: RoleRow | undefined) =>
      memberships.filter(
        (m) => (row && m.roleId === row.id) || (!m.roleId && m.role === key && isSystemKey(key)),
      ).length;

    const roles: RoleDto[] = USER_ROLES.map((key) => {
      const row = rows.find((r) => r.isSystem && r.key === key);
      return this.toDto(key, row, locale, defaultLocale, countFor(key, row));
    });
    for (const row of rows.filter((r) => !r.isSystem)) {
      roles.push(this.toDto(row.key, row, locale, defaultLocale, countFor(row.key, row)));
    }

    return {
      capabilities: CAPABILITIES.map((key) => ({ key, group: CAPABILITY_GROUPS[key] })),
      roles,
    };
  }

  private toDto(
    key: string,
    row: RoleRow | undefined,
    locale: string | null,
    defaultLocale: string,
    memberCount: number,
  ): RoleDto {
    const system = isSystemKey(key) && (!row || row.isSystem);
    const defaults = system ? SYSTEM_ROLE_DEFAULTS[key as UserRole] : undefined;
    const rowName = row ? normalizeLocalized(row.name) : {};
    const name = hasLocalized(rowName) ? rowName : (defaults?.name ?? {});
    const rowDescription = row ? normalizeLocalized(row.description, DESCRIPTION_MAX) : {};
    const capabilities: Capability[] =
      key === 'SUPER_ADMIN'
        ? [...CAPABILITIES]
        : row
          ? knownCapabilities(row.capabilities)
          : defaultCapabilities(key);
    return {
      id: row?.id ?? null,
      key,
      name,
      displayName: pickLocalized(name, locale, key, defaultLocale),
      description: hasLocalized(rowDescription) ? rowDescription : (defaults?.description ?? {}),
      baseRole: (row?.baseRole ?? key) as UserRole,
      capabilities,
      isSystem: system,
      editable: key !== 'SUPER_ADMIN',
      memberCount,
    };
  }

  // ------------------------------------------------------------------ guard rails

  private validateCapabilities(input: readonly string[]): Capability[] {
    const unknown = input.filter((c) => !KNOWN.has(c));
    if (unknown.length) throw unprocessable('Unknown capability', { unknown });
    return [...new Set(input)] as Capability[];
  }

  private assertLockedKept(key: string, capabilities: readonly Capability[]) {
    if (key !== 'CLINIC_ADMIN') return;
    const missing = LOCKED_ADMIN_CAPABILITIES.filter((c) => !capabilities.includes(c));
    if (missing.length) {
      throw unprocessable('The clinic admin role must keep these capabilities', {
        locked: missing,
      });
    }
  }

  private async uniqueKey(clinicId: string, name: LocalizedText): Promise<string> {
    const base = roleSlug(name);
    const existing = await this.prisma.clinicRole.findMany({
      where: { clinicId, key: { startsWith: base } },
      select: { key: true },
    });
    const taken = new Set(existing.map((r) => r.key));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i += 1) {
      if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  // ------------------------------------------------------------------ write

  async create(dto: CreateRoleDto, locale: string | null): Promise<RoleDto> {
    const scope = this.tenant.get();
    const name = normalizeLocalized(dto.name);
    if (!hasLocalized(name)) {
      throw unprocessable('A role name is required in at least one language');
    }
    if (dto.baseRole === 'SUPER_ADMIN') {
      throw unprocessable('A custom role cannot be based on SUPER_ADMIN', { field: 'baseRole' });
    }
    const capabilities = this.validateCapabilities(dto.capabilities);
    await this.rbac.assertCanGrant(scope, capabilities);
    await this.rbac.assertCanUseBaseRole(scope, dto.baseRole);

    const customCount = await this.prisma.clinicRole.count({
      where: { clinicId: scope.clinicId, isSystem: false },
    });
    if (customCount >= MAX_CUSTOM_ROLES) {
      throw unprocessable(`A clinic can have at most ${MAX_CUSTOM_ROLES} custom roles`, {
        max: MAX_CUSTOM_ROLES,
      });
    }

    const key = await this.uniqueKey(scope.clinicId, name);
    const description = normalizeLocalized(dto.description, DESCRIPTION_MAX);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicRole.create({
        data: {
          clinicId: scope.clinicId,
          key,
          name,
          description,
          baseRole: dto.baseRole,
          capabilities,
          isSystem: false,
        },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'create',
        entity: 'clinic_role',
        entityId: created.id,
        after: snapshot(created),
      });
    });
    await this.rbac.invalidate(scope.clinicId);
    return this.single(key, locale);
  }

  async update(key: string, dto: UpdateRoleDto, locale: string | null): Promise<RoleDto> {
    const scope = this.tenant.get();
    if (key === 'SUPER_ADMIN') throw forbidden('The super admin role cannot be edited');
    const system = isSystemKey(key);
    const row = await this.prisma.clinicRole.findFirst({
      where: { clinicId: scope.clinicId, key },
    });
    if ((!system && !row) || (system && row && !row.isSystem)) throw notFound('Role not found');
    if (system && dto.baseRole && dto.baseRole !== key) {
      throw unprocessable('The base role of a system role cannot change', { field: 'baseRole' });
    }
    if (dto.baseRole === 'SUPER_ADMIN') {
      throw unprocessable('A role cannot be based on SUPER_ADMIN', { field: 'baseRole' });
    }

    if (!system && row && dto.baseRole && dto.baseRole !== row.baseRole) {
      await this.rbac.assertCanUseBaseRole(scope, dto.baseRole);
    }

    const currentCaps: Capability[] = row
      ? knownCapabilities(row.capabilities)
      : defaultCapabilities(key);
    const nextCaps = dto.capabilities ? this.validateCapabilities(dto.capabilities) : currentCaps;
    if (dto.capabilities) {
      await this.rbac.assertCanGrant(
        scope,
        nextCaps.filter((c) => !currentCaps.includes(c)),
      );
    }
    this.assertLockedKept(key, nextCaps);

    let name: LocalizedText | undefined;
    if (dto.name) {
      name = normalizeLocalized(dto.name);
      if (!hasLocalized(name)) {
        throw unprocessable('A role name is required in at least one language');
      }
    }
    const description = dto.description
      ? normalizeLocalized(dto.description, DESCRIPTION_MAX)
      : undefined;

    const affectedUserIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      let after: RoleRow;
      if (row) {
        after = await tx.clinicRole.update({
          where: { id: row.id },
          data: {
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
            ...(dto.baseRole && !system ? { baseRole: dto.baseRole } : {}),
            ...(dto.capabilities ? { capabilities: nextCaps } : {}),
          },
        });
        if (!system && dto.baseRole && dto.baseRole !== row.baseRole) {
          // Members carry the base role so legacy role checks keep working.
          const members = await tx.userMembership.findMany({
            where: { clinicId: scope.clinicId, roleId: row.id },
            select: { userId: true },
            take: MAX_EVENT_USERS,
          });
          affectedUserIds.push(...members.map((m) => m.userId));
          await tx.userMembership.updateMany({
            where: { clinicId: scope.clinicId, roleId: row.id },
            data: { role: dto.baseRole },
          });
        }
      } else {
        const defaults = SYSTEM_ROLE_DEFAULTS[key as UserRole];
        after = await tx.clinicRole.create({
          data: {
            clinicId: scope.clinicId,
            key,
            name: name ?? defaults.name,
            description: description ?? defaults.description,
            baseRole: key as UserRole,
            capabilities: nextCaps,
            isSystem: true,
          },
        });
      }
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: row ? 'update' : 'create',
        entity: 'clinic_role',
        entityId: after.id,
        before: snapshot(
          row ?? {
            key,
            name: SYSTEM_ROLE_DEFAULTS[key as UserRole]?.name,
            baseRole: key,
            capabilities: currentCaps,
            isSystem: true,
          },
        ),
        after: snapshot(after),
      });
    });
    await this.rbac.invalidate(scope.clinicId);
    await this.emitRoleChanged(scope, affectedUserIds);
    return this.single(key, locale);
  }

  /** One `membership.role_changed` per affected member (capped), after commit. */
  private async emitRoleChanged(scope: TenantScope, userIds: readonly string[]) {
    for (const userId of userIds.slice(0, MAX_EVENT_USERS)) {
      await this.events.emit({
        type: 'membership.role_changed',
        clinicId: scope.clinicId,
        organizationId: scope.organizationId,
        actorUserId: scope.userId,
        payload: { userId },
      });
    }
  }

  async remove(key: string): Promise<{ success: true }> {
    const scope = this.tenant.get();
    if (key === 'SUPER_ADMIN') throw forbidden('The super admin role cannot be edited');
    const system = isSystemKey(key);
    const row = await this.prisma.clinicRole.findFirst({
      where: { clinicId: scope.clinicId, key },
    });
    if (!row) {
      if (system) return { success: true };
      throw notFound('Role not found');
    }
    if (system !== row.isSystem) throw notFound('Role not found');

    if (!system) {
      const [members, invitations] = await Promise.all([
        this.prisma.userMembership.count({ where: { clinicId: scope.clinicId, roleId: row.id } }),
        this.prisma.invitation.count({
          where: {
            clinicId: scope.clinicId,
            roleId: row.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);
      if (members > 0 || invitations > 0) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'This role is still assigned to members or pending invitations',
          details: { members, invitations },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (system) {
        // Reset to defaults: members and invitations fall back to the system role by name.
        await tx.userMembership.updateMany({
          where: { clinicId: scope.clinicId, roleId: row.id },
          data: { roleId: null },
        });
        await tx.invitation.updateMany({
          where: { clinicId: scope.clinicId, roleId: row.id },
          data: { roleId: null },
        });
      }
      await tx.clinicRole.delete({ where: { id: row.id } });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'delete',
        entity: 'clinic_role',
        entityId: row.id,
        before: snapshot(row),
      });
    });
    await this.rbac.invalidate(scope.clinicId);
    return { success: true };
  }

  private async single(key: string, locale: string | null): Promise<RoleDto> {
    const matrix = await this.matrix(locale);
    const found = matrix.roles.find((r) => r.key === key);
    if (!found) throw notFound('Role not found');
    return found;
  }

  // ------------------------------------------------------------------ assignment

  async assign(membershipId: string, dto: AssignRoleDto) {
    const scope = this.tenant.get();
    const membership = await this.prisma.userMembership.findFirst({
      where: { id: membershipId, clinicId: scope.clinicId, organizationId: scope.organizationId },
    });
    if (!membership) throw notFound('Membership not found');
    if (membership.userId === scope.userId) throw forbidden('You cannot change your own role');
    if (membership.role === 'SUPER_ADMIN' && scope.role !== 'SUPER_ADMIN') {
      throw forbidden('Only a super admin can change a super admin');
    }

    let baseRole: UserRole;
    let roleId: string | null = null;
    let capabilities: Capability[];
    if (isSystemKey(dto.roleKey)) {
      baseRole = dto.roleKey;
      if (baseRole === 'SUPER_ADMIN' && scope.role !== 'SUPER_ADMIN') {
        throw forbidden('Only a super admin can assign the super admin role');
      }
      const customised = await this.prisma.clinicRole.findFirst({
        where: { clinicId: scope.clinicId, key: baseRole, isSystem: true },
        select: { capabilities: true },
      });
      capabilities =
        baseRole === 'SUPER_ADMIN'
          ? [...CAPABILITIES]
          : customised
            ? knownCapabilities(customised.capabilities)
            : defaultCapabilities(baseRole);
    } else {
      const role = await this.prisma.clinicRole.findFirst({
        where: { clinicId: scope.clinicId, key: dto.roleKey, isSystem: false },
      });
      if (!role) throw notFound('Role not found');
      baseRole = role.baseRole as UserRole;
      roleId = role.id;
      capabilities = knownCapabilities(role.capabilities);
    }
    if (baseRole !== 'SUPER_ADMIN') {
      await this.rbac.assertCanGrant(scope, capabilities);
      await this.rbac.assertCanUseBaseRole(scope, baseRole);
    }
    await this.rbac.assertCanManageMember(scope, membership, capabilities);

    await this.prisma.$transaction(async (tx) => {
      await tx.userMembership.update({
        where: { id: membership.id },
        data: { role: baseRole, roleId },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'update',
        entity: 'user_membership',
        entityId: membership.id,
        before: { role: membership.role, roleId: membership.roleId },
        after: { role: baseRole, roleId, roleKey: dto.roleKey },
      });
    });
    await this.rbac.invalidate(scope.clinicId);
    await this.emitRoleChanged(scope, [membership.userId]);
    return { membershipId: membership.id, roleKey: dto.roleKey, role: baseRole, roleId };
  }
}
