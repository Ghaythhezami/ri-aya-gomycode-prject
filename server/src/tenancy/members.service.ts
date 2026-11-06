import { ForbiddenException, Injectable } from '@nestjs/common';
import { personName } from '../common/mappers';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantContext, clinicWhere } from './tenant-context';

export interface MemberView {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  role: string;
  status: string;
  isSelf: boolean;
}

/** The staff of the caller's clinic, for the team and role-assignment screens. */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly rbac: RbacService,
  ) {}

  async list(): Promise<MemberView[]> {
    const scope = this.tenant.get();
    const allowed =
      (await this.rbac.has(scope, 'manageStaff')) || (await this.rbac.has(scope, 'inviteStaff'));
    if (!allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action',
      });
    }
    const rows = await this.prisma.userMembership.findMany({
      where: clinicWhere(scope),
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            firstNameI18n: true,
            lastNameI18n: true,
          },
        },
      },
    });
    const label = await this.rbac.roleLabeler(scope.clinicId);
    return rows
      .map((row) => ({
        membershipId: row.id,
        userId: row.userId,
        name: personName(row.user),
        email: row.user.email,
        ...label(row),
        role: row.role as string,
        status: row.status as string,
        isSelf: row.userId === scope.userId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
