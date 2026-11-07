import { normalizeLocalized, type LocalizedText } from '@riaya/shared';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RbacService } from '../rbac/rbac.service';
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
  /** Every language the organization name was entered in (UI picks its language). */
  organizationNameI18n: LocalizedText;
  clinicId: string;
  clinicName: string;
  /** Every language the clinic name was entered in (UI picks its language). */
  clinicNameI18n: LocalizedText;
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
    @Optional() private readonly rbac?: RbacService,
    @Optional() private readonly events?: DomainEventsService,
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
      organizationNameI18n: normalizeLocalized(row.organization.nameI18n),
      clinicId: row.clinicId,
      clinicName: row.clinic.name,
      clinicNameI18n: normalizeLocalized(row.clinic.nameI18n),
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
      roleId: membership.roleId ?? null,
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
      roleId: membership.roleId ?? null,
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

    // The target must not be more powerful than the caller, and the clinic must keep a role manager.
    if (this.rbac) {
      await this.rbac.assertCanManageMember(this.tenant.get(), membership, null);
    }

    await this.prisma.userMembership.update({
      where: { id: membership.id },
      data: { status: 'SUSPENDED' },
    });
    if (this.rbac) await this.rbac.invalidate(membership.clinicId);
    // After the write: comms disconnects the member's sockets.
    await this.events?.emit({
      type: 'membership.suspended',
      clinicId: membership.clinicId,
      organizationId: membership.organizationId,
      actorUserId: this.tenant.peek()?.userId ?? null,
      payload: { userId: membership.userId },
    });
  }

  /**
   * Locate a membership inside the caller's tenant, or return null. When
   * `clinicId` is null the caller is organization-wide and may reach any clinic
   * in their organization; otherwise the membership must belong to that clinic.
   */
  private async findMembershipInTenant(request: SuspendMembershipRequest): Promise<{
    id: string;
    userId: string;
    clinicId: string;
    role: string;
    roleId: string | null;
    status: string;
    organizationId: string;
  } | null> {
    const filter = request.organizationWide ? this.organizationFilter() : this.clinicFilter();

    return this.prisma.userMembership.findFirst({
      where: { id: request.membershipId, ...filter },
      select: {
        id: true,
        userId: true,
        clinicId: true,
        role: true,
        roleId: true,
        status: true,
        organizationId: true,
      },
    });
  }
}
