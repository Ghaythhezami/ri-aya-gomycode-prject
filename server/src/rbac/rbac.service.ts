import { ConflictException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import {
  CAPABILITIES,
  defaultCapabilities,
  normalizeLocalized,
  pickLocalized,
  type Capability,
  type LocalizedText,
  type UserRole,
} from '@riaya/shared';
import { SYSTEM_ROLE_DEFAULTS } from './system-roles';
import { RedisCacheService } from '../cache/redis-cache.service';
import { PrismaService } from '../database/prisma.service';
import { RequestLocale } from '../common/locale/request-locale';
import type { TenantScope } from '../tenancy/tenant-context';

/** Cache lifetime of a resolved capability set; role edits bump the clinic version instead. */
export const RBAC_CACHE_SECONDS = 60;

type RbacScope = Pick<TenantScope, 'clinicId' | 'userId' | 'role'> & { roleId?: string | null };

/** Privilege rank of a base role: nobody may hand out a base role above their own. */
const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 3,
  CLINIC_ADMIN: 2,
  DOCTOR: 1,
  RECEPTIONIST: 1,
};

function forbidden(message: string, details?: unknown) {
  return new ForbiddenException({ code: 'FORBIDDEN', message, details });
}

/**
 * Effective capabilities of a membership:
 * - SUPER_ADMIN: every capability, always (cannot be customised or locked out);
 * - a membership with `roleId`: that clinic role's capabilities;
 * - otherwise the clinic's customised system role (ClinicRole with key = role), if any;
 * - otherwise the default matrix of the shared package.
 * Unknown capability strings stored in the database are ignored (deny by default).
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: RedisCacheService,
  ) {}

  private versionKey(clinicId: string): string {
    return `rbac:v:${clinicId}`;
  }

  /** Invalidate every cached capability set of the clinic (after a role or assignment change). */
  async invalidate(clinicId: string): Promise<void> {
    await this.cache?.set(this.versionKey(clinicId), Date.now(), 86_400);
  }

  /**
   * `fresh: true` skips the cache read. Every write guard (grant, assign, suspend, invite)
   * uses it so a just-revoked capability cannot be used for 60 more seconds.
   */
  async capabilitiesFor(scope: RbacScope, opts: { fresh?: boolean } = {}): Promise<Capability[]> {
    if (scope.role === 'SUPER_ADMIN') return [...CAPABILITIES];
    const version = (await this.cache?.get<number>(this.versionKey(scope.clinicId))) ?? 0;
    const key = `rbac:${scope.clinicId}:${scope.roleId ?? scope.role}:${version}`;
    if (!opts.fresh) {
      const cached = await this.cache?.get<Capability[]>(key);
      if (cached) return cached;
    }

    // The in-memory Prisma used by the auth e2e suites has no clinic_roles table.
    const roles = this.prisma.clinicRole as PrismaService['clinicRole'] | undefined;
    const row = !roles
      ? null
      : scope.roleId
        ? await roles.findFirst({
            where: { id: scope.roleId, clinicId: scope.clinicId },
            select: { capabilities: true },
          })
        : await roles.findFirst({
            where: { clinicId: scope.clinicId, key: scope.role, isSystem: true },
            select: { capabilities: true },
          });
    const known = new Set<string>(CAPABILITIES);
    const capabilities = row
      ? (row.capabilities.filter((c: string) => known.has(c)) as Capability[])
      : defaultCapabilities(scope.role);
    await this.cache?.set(key, capabilities, RBAC_CACHE_SECONDS);
    return capabilities;
  }

  /** Capabilities plus the role's key and localized name, for /auth/me and /profile. */
  async describe(
    scope: Pick<TenantScope, 'clinicId' | 'userId' | 'role'> & { roleId?: string | null },
  ): Promise<{
    capabilities: Capability[];
    roleKey: string;
    roleName: LocalizedText;
    defaultLocale: string;
  }> {
    const capabilities = await this.capabilitiesFor(scope);
    let roleKey: string = scope.role;
    let roleName: LocalizedText = SYSTEM_ROLE_DEFAULTS[scope.role]?.name ?? {};
    const roles = this.prisma.clinicRole as PrismaService['clinicRole'] | undefined;
    if (roles && scope.role !== 'SUPER_ADMIN') {
      const row = await roles.findFirst({
        where: scope.roleId
          ? { id: scope.roleId, clinicId: scope.clinicId }
          : { clinicId: scope.clinicId, key: scope.role, isSystem: true },
        select: { key: true, name: true },
      });
      if (row) {
        roleKey = row.key;
        const name = normalizeLocalized(row.name);
        if (Object.keys(name).length) roleName = name;
      }
    }
    const settings = (this.prisma.clinicSettings as PrismaService['clinicSettings'] | undefined)
      ? await this.prisma.clinicSettings.findUnique({
          where: { clinicId: scope.clinicId },
          select: { defaultLanguage: true },
        })
      : null;
    return { capabilities, roleKey, roleName, defaultLocale: settings?.defaultLanguage ?? 'en' };
  }

  async has(
    scope: RbacScope,
    capability: Capability,
    opts: { fresh?: boolean } = {},
  ): Promise<boolean> {
    return (await this.capabilitiesFor(scope, opts)).includes(capability);
  }

  /**
   * Resolver of `{ roleKey, roleName }` for lists of memberships or invitations, with the name
   * in the request language (clinic default, then any filled language, as everywhere else).
   */
  async roleLabeler(
    clinicId: string,
  ): Promise<
    (m: { role: string; roleId?: string | null }) => { roleKey: string; roleName: string }
  > {
    const roles = this.prisma.clinicRole as PrismaService['clinicRole'] | undefined;
    const rows = roles
      ? await roles.findMany({
          where: { clinicId },
          select: { id: true, key: true, name: true, isSystem: true },
        })
      : [];
    // The in-memory Prisma of the e2e suites has no clinic_settings table.
    const settings = (this.prisma.clinicSettings as PrismaService['clinicSettings'] | undefined)
      ? await this.prisma.clinicSettings.findUnique({
          where: { clinicId },
          select: { defaultLanguage: true },
        })
      : null;
    const defaultLocale = settings?.defaultLanguage ?? 'en';
    const locale = RequestLocale.get();
    return (m) => {
      const row = m.roleId
        ? rows.find((r) => r.id === m.roleId)
        : rows.find((r) => r.isSystem && r.key === m.role);
      const roleKey = row?.key ?? m.role;
      const own = row ? normalizeLocalized(row.name) : {};
      const name = Object.keys(own).length
        ? own
        : (SYSTEM_ROLE_DEFAULTS[m.role as UserRole]?.name ?? {});
      return { roleKey, roleName: pickLocalized(name, locale, roleKey, defaultLocale) };
    };
  }

  /** Nobody can grant a capability they do not hold (fresh read of the caller's set). */
  async assertCanGrant(caller: RbacScope, granted: readonly Capability[]): Promise<void> {
    const mine = new Set(await this.capabilitiesFor(caller, { fresh: true }));
    const escalation = granted.filter((c) => !mine.has(c));
    if (escalation.length) {
      throw forbidden('You cannot grant capabilities you do not hold', {
        capabilities: escalation,
      });
    }
  }

  /**
   * A role's `baseRole` is a privilege of its own (legacy role checks, data scope). The caller
   * needs a base role of at most their own rank AND all of its default capabilities.
   */
  async assertCanUseBaseRole(caller: RbacScope, baseRole: string): Promise<void> {
    if (caller.role === 'SUPER_ADMIN') return;
    if (baseRole === 'SUPER_ADMIN' || (ROLE_RANK[baseRole] ?? 99) > (ROLE_RANK[caller.role] ?? 0)) {
      throw forbidden('You cannot use a base role above your own', { baseRole });
    }
    const mine = new Set(await this.capabilitiesFor(caller, { fresh: true }));
    const missing = defaultCapabilities(baseRole).filter((c) => !mine.has(c));
    if (missing.length) {
      throw forbidden('You cannot use a base role with capabilities you do not hold', {
        baseRole,
        capabilities: missing,
      });
    }
  }

  /**
   * Guard for changing or suspending another member: their effective capabilities must be a
   * subset of the caller's, and the clinic must keep an ACTIVE member who can manage roles.
   * `next` is the capability set after the change, or null when the member is suspended.
   */
  async assertCanManageMember(
    caller: RbacScope,
    target: {
      id: string;
      userId: string;
      clinicId: string;
      role: string;
      roleId?: string | null;
      status: string;
    },
    next: readonly Capability[] | null,
  ): Promise<void> {
    if ((ROLE_RANK[target.role] ?? 99) > (ROLE_RANK[caller.role] ?? 0)) {
      throw forbidden('You cannot change a member with a higher base role than yours');
    }
    const mine = new Set(await this.capabilitiesFor(caller, { fresh: true }));
    const targetCaps = await this.capabilitiesFor(
      {
        clinicId: target.clinicId,
        userId: target.userId,
        role: target.role as RbacScope['role'],
        roleId: target.roleId,
      },
      { fresh: true },
    );
    if (targetCaps.some((c) => !mine.has(c))) {
      throw forbidden('You cannot change a member who holds more capabilities than you');
    }
    const losesRoleManagement =
      target.status === 'ACTIVE' &&
      targetCaps.includes('manageRoles') &&
      (next === null || !next.includes('manageRoles'));
    if (!losesRoleManagement) return;
    const others = await this.prisma.userMembership.findMany({
      where: { clinicId: target.clinicId, status: 'ACTIVE', id: { not: target.id } },
      select: { userId: true, role: true, roleId: true },
    });
    for (const other of others) {
      const caps = await this.capabilitiesFor(
        {
          clinicId: target.clinicId,
          userId: other.userId,
          role: other.role as RbacScope['role'],
          roleId: other.roleId,
        },
        { fresh: true },
      );
      if (caps.includes('manageRoles')) return;
    }
    throw new ConflictException({
      code: 'VALIDATION_FAILED',
      message: 'The clinic must keep at least one active member who can manage roles',
    });
  }
}
