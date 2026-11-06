import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user-role.enum';
import { TenantContext, clinicWhere, organizationWhere, type TenantScope } from './tenant-context';

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

  /** Active memberships for a user, used by the workspace switcher (FR-032). */
  async listMemberships(userId: string): Promise<MembershipView[]> {
    const rows = await this.prisma.userMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { clinic: true, organization: true },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      membershipId: row.id,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      clinicId: row.clinicId,
      clinicName: row.clinic.name,
      clinicTimezone: row.clinic.timezone,
      role: row.role as UserRole,
    }));
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
    if (!membership) return null;

    return {
      userId,
      organizationId: membership.organizationId,
      clinicId: membership.clinicId,
      role: membership.role as UserRole,
      membershipId: membership.id,
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
  ): Promise<{ id: string; role: string; organizationId: string } | null> {
    const filter = request.organizationWide ? this.organizationFilter() : this.clinicFilter();

    return this.prisma.userMembership.findFirst({
      where: { id: request.membershipId, ...filter },
      select: { id: true, role: true, organizationId: true },
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
