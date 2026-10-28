import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserRole } from '../users/user-role.enum';
import type { TenantScope } from './tenant-context';

export interface MembershipView {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  clinicId: string;
  clinicName: string;
  role: UserRole;
}

/**
 * Reads and writes the tenancy hierarchy. Every query that touches clinic data
 * must go through a scope obtained here, never through a caller-supplied id.
 */
@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Suspend a membership (FR-018). Audit history is untouched (FR-020). */
  async suspendMembership(membershipId: string): Promise<void> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { id: membershipId },
    });
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
          id: { not: membershipId },
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
      where: { id: membershipId },
      data: { status: 'SUSPENDED' },
    });
  }
}
