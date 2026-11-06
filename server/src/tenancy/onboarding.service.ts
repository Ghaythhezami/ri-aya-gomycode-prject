import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { CAPABILITIES, defaultCapabilities, type Capability } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { UserRole } from '../users/user-role.enum';
import { clinicWhere, organizationWhere, type TenantScope } from './tenant-context';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The three appointment types every clinic starts with (ADR 0004 section 2). */
const SYSTEM_APPOINTMENT_TYPES = [
  {
    code: 'CONSULTATION',
    name: { en: 'Consultation', fr: 'Consultation', ar: 'استشارة' },
    durationMinutes: 30,
    color: 'primary',
    isEmergency: false,
    sortOrder: 0,
  },
  {
    code: 'FOLLOW_UP',
    name: { en: 'Follow-up', fr: 'Suivi', ar: 'متابعة' },
    durationMinutes: 15,
    color: 'info',
    isEmergency: false,
    sortOrder: 1,
  },
  {
    code: 'EMERGENCY',
    name: { en: 'Emergency', fr: 'Urgence', ar: 'طوارئ' },
    durationMinutes: 20,
    color: 'alert',
    isEmergency: true,
    sortOrder: 2,
  },
] as const;

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  clinicName: string;
  preferredLocale?: 'en' | 'ar' | 'fr';
}

/**
 * Registration, organization provisioning and staff invitations.
 *
 * The public register path can ONLY create a brand-new organization with the
 * caller as SUPER_ADMIN — it can never join an existing clinic (FR-033,
 * AC-018). Joining a clinic happens exclusively through an invitation.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly rbac?: RbacService,
  ) {}

  /** Insert the system appointment types of a new clinic. The in-memory test Prisma lacks them. */
  private async ensureSystemAppointmentTypes(
    tx: { appointmentTypeDef?: { createMany: (args: never) => Promise<unknown> } },
    clinicId: string,
  ): Promise<void> {
    const delegate = tx.appointmentTypeDef;
    if (!delegate) return;
    await delegate.createMany({
      data: SYSTEM_APPOINTMENT_TYPES.map((type) => ({ clinicId, isSystem: true, ...type })),
      skipDuplicates: true,
    } as never);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private slugify(value: string): string {
    const base = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return base || 'org';
  }

  /**
   * Create identity + organization + first clinic + SUPER_ADMIN membership in
   * one transaction (FR-005, AC-001). Nothing is persisted if any step fails,
   * so a partial wizard submission cannot leave orphan rows (AC-002).
   */
  async register(input: RegisterInput) {
    if (!isStrongPassword(input.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }

    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await argon2.hash(input.password);
    const slug = `${this.slugify(input.organizationName)}-${randomBytes(3).toString('hex')}`;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          preferredLocale: input.preferredLocale ?? 'en',
          isActive: true,
        },
      });

      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });

      const clinic = await tx.clinic.create({
        data: {
          organizationId: organization.id,
          name: input.clinicName,
          timezone: 'UTC',
          currency: 'USD',
        },
      });

      const membership = await tx.userMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          clinicId: clinic.id,
          role: UserRole.SUPER_ADMIN,
          status: 'ACTIVE',
        },
      });

      await this.ensureSystemAppointmentTypes(tx as never, clinic.id);

      // Audit inside the same transaction: a rollback leaves no entry (FR-017).
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'create',
        entity: 'organization',
        entityId: organization.id,
        after: { name: organization.name, slug: organization.slug },
        organizationId: organization.id,
        clinicId: clinic.id,
      });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'create',
        entity: 'clinic',
        entityId: clinic.id,
        after: { name: clinic.name },
        organizationId: organization.id,
        clinicId: clinic.id,
      });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'create',
        entity: 'user_membership',
        entityId: membership.id,
        after: { role: membership.role, status: membership.status },
        organizationId: organization.id,
        clinicId: clinic.id,
      });

      return { user, organization, clinic, membership };
    });
  }

  /**
   * Attach a new organization + first clinic to an EXISTING identity (FR-006,
   * AC-010). No second account is created.
   */
  async createOrganizationForUser(
    userId: string,
    input: { organizationName: string; clinicName: string },
  ) {
    const slug = `${this.slugify(input.organizationName)}-${randomBytes(3).toString('hex')}`;

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });
      const clinic = await tx.clinic.create({
        data: {
          organizationId: organization.id,
          name: input.clinicName,
          timezone: 'UTC',
          currency: 'USD',
        },
      });
      const membership = await tx.userMembership.create({
        data: {
          userId,
          organizationId: organization.id,
          clinicId: clinic.id,
          role: UserRole.SUPER_ADMIN,
          status: 'ACTIVE',
        },
      });
      await this.ensureSystemAppointmentTypes(tx as never, clinic.id);
      return { organization, clinic, membership };
    });
  }

  /**
   * Issue an invitation (FR-007). Any earlier unconsumed invitation for the
   * same email + clinic is revoked so only the newest token works (FR-031).
   *
   * `clinicId` arrives from the request body, so the caller supplies the target:
   * the clinic MUST belong to the caller's own organization. A clinic in another
   * organization is reported as not found, never as forbidden, so the route does
   * not disclose that it exists.
   */
  async invite(params: {
    email: string;
    clinicId: string;
    scope: TenantScope;
    role?: UserRole;
    /** System role name or custom role key of the clinic; wins over `role`. */
    roleKey?: string;
    invitedById: string;
  }) {
    // Only a super admin may invite into another clinic of the organization; everyone else is
    // limited to the clinic of their own token. Reported as not found, never as forbidden.
    const otherClinic =
      params.scope.role !== UserRole.SUPER_ADMIN && params.clinicId !== params.scope.clinicId;
    const clinic = otherClinic
      ? null
      : await this.prisma.clinic.findFirst({
          where: { id: params.clinicId, ...organizationWhere(params.scope) },
        });
    if (!clinic) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }

    const { role, roleId } = await this.resolveInviteRole(params, clinic.id);

    const email = params.email.toLowerCase();
    const raw = randomBytes(32).toString('hex');

    await this.prisma.invitation.updateMany({
      where: { email, clinicId: params.clinicId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        organizationId: clinic.organizationId,
        clinicId: params.clinicId,
        role,
        roleId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: params.invitedById,
      },
    });

    return { invitation, token: raw, clinicName: clinic.name, role };
  }

  /**
   * The legacy role (`role` = base role) and optional clinic role of an invitation.
   * A role chosen by key can only be granted by someone who holds all of its capabilities.
   */
  private async resolveInviteRole(
    params: { role?: UserRole; roleKey?: string; scope: TenantScope },
    clinicId: string,
  ): Promise<{ role: UserRole; roleId: string | null }> {
    const key = params.roleKey ?? params.role;
    if (!key) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A role is required' });
    }
    const isSystem = (Object.values(UserRole) as string[]).includes(key);
    // The in-memory Prisma of the e2e suites has no clinic_roles table.
    const roles = this.prisma.clinicRole as PrismaService['clinicRole'] | undefined;
    let role: UserRole;
    let roleId: string | null = null;
    let granted: Capability[];
    if (isSystem) {
      role = key as UserRole;
      granted = role === UserRole.SUPER_ADMIN ? [...CAPABILITIES] : defaultCapabilities(role);
      const custom = roles
        ? await roles.findFirst({
            where: { clinicId, key, isSystem: true },
            select: { capabilities: true },
          })
        : null;
      if (custom && role !== UserRole.SUPER_ADMIN) granted = custom.capabilities as Capability[];
    } else {
      const row = roles
        ? await roles.findFirst({ where: { clinicId, key, isSystem: false } })
        : null;
      if (!row) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
      }
      role = row.baseRole as UserRole;
      roleId = row.id;
      granted = row.capabilities as Capability[];
    }
    // Only a super admin may invite a super admin, whichever field named the role.
    if (role === UserRole.SUPER_ADMIN) {
      if (params.scope.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only a super admin can invite a super admin',
        });
      }
    } else if (this.rbac) {
      // Both the legacy `role` path and `roleKey`: the caller must hold every capability of the
      // invited role and may not hand out a base role above their own (fresh read, no cache).
      await this.rbac.assertCanGrant(params.scope, granted);
      await this.rbac.assertCanUseBaseRole(params.scope, role);
    }
    return { role, roleId };
  }

  /**
   * Consume an invitation and set the invitee's password (FR-008, AC-016).
   * The token is single-use: a second attempt is rejected (AC-017).
   */
  async acceptInvitation(params: {
    token: string;
    password: string;
    /** Required when the invited email already has an account. */
    currentPassword?: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (!isStrongPassword(params.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }

    const tokenHash = this.hashToken(params.token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.consumedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw this.invalidInvitation();
    }

    // An existing account is never given a new password by an invitation: the invitee proves
    // the account with its current password (or signs in first).
    const known = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (known) {
      if (!params.currentPassword) {
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS_LOGIN_REQUIRED',
          message:
            'An account with this email already exists. Send your current password with the invitation, or sign in first.',
        });
      }
      if (!(await argon2.verify(known.passwordHash, params.currentPassword))) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        });
      }
    }

    const passwordHash = known ? null : await argon2.hash(params.password);

    return this.prisma.$transaction(async (tx) => {
      // Claim the invitation atomically first: of two concurrent accepts only one gets count 1.
      const now = new Date();
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count === 0) throw this.invalidInvitation();

      const existing = await tx.user.findUnique({ where: { email: invitation.email } });
      if (existing && !known) {
        // Registered between the check and the claim: ask the invitee to retry with the password.
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS_LOGIN_REQUIRED',
          message: 'An account with this email already exists. Retry with your current password.',
        });
      }
      if (!existing && !passwordHash) throw this.invalidInvitation();
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash: passwordHash as string,
            firstName: params.firstName ?? '',
            lastName: params.lastName ?? '',
            isActive: true,
          },
        }));

      // A suspended membership is never silently reactivated by an invitation.
      const current = await tx.userMembership.findFirst({
        where: { userId: user.id, clinicId: invitation.clinicId },
      });
      if (current?.status === 'SUSPENDED') {
        throw new ConflictException({
          code: 'MEMBERSHIP_SUSPENDED',
          message: 'This membership is suspended. Ask a clinic administrator to reactivate it.',
        });
      }

      // Grant exactly the invited membership (FR-030).
      await tx.userMembership.upsert({
        where: { userId_clinicId: { userId: user.id, clinicId: invitation.clinicId } },
        update: { role: invitation.role, roleId: invitation.roleId ?? null, status: 'ACTIVE' },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          clinicId: invitation.clinicId,
          role: invitation.role,
          roleId: invitation.roleId ?? null,
          status: 'ACTIVE',
        },
      });

      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'create',
        entity: 'user_membership',
        entityId: `${user.id}:${invitation.clinicId}`,
        after: { role: invitation.role, roleId: invitation.roleId ?? null, via: 'invitation' },
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
      });

      return { userId: user.id, clinicId: invitation.clinicId, role: invitation.role };
    });
  }

  private invalidInvitation(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_INVITATION',
      message: 'This invitation is invalid or has expired',
    });
  }

  /** Pending (unconsumed, unexpired) invitations for the caller's clinic (FR-027). */
  async listPendingInvitations(scope: TenantScope) {
    const rows = await this.prisma.invitation.findMany({
      where: { ...clinicWhere(scope), consumedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        roleId: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const label = this.rbac ? await this.rbac.roleLabeler(scope.clinicId) : null;
    return rows.map((row) => ({
      ...row,
      ...(label ? label(row) : { roleKey: row.role, roleName: row.role }),
    }));
  }
}
