import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user-role.enum';
import { clinicWhere, organizationWhere, type TenantScope } from './tenant-context';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';
import type { DeliveryOutcome } from '../mail/mail.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  ) {}

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
    role: UserRole;
    invitedById: string;
  }) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: params.clinicId, ...organizationWhere(params.scope) },
    });
    if (!clinic) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }

    // Only a SUPER_ADMIN may grant the organization-wide role. Without this an
    // admin of one clinic could invite a new (or their own) account as
    // SUPER_ADMIN and escalate past their clinic scope.
    if (params.role === UserRole.SUPER_ADMIN && params.scope.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Only a super admin can grant the super admin role',
      });
    }

    const email = params.email.toLowerCase();

    // Never create a second invitation for the same address in this clinic while
    // one is still live. The admin can use Resend on the existing row instead.
    const pending = await this.prisma.invitation.findFirst({
      where: {
        email,
        clinicId: params.clinicId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_PENDING',
        message: 'An invitation is already pending for this email',
      });
    }

    // An existing active member does not need an invitation.
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const membership = await this.prisma.userMembership.findFirst({
        where: { userId: existingUser.id, clinicId: params.clinicId, status: 'ACTIVE' },
      });
      if (membership) {
        throw new ConflictException({
          code: 'ALREADY_A_MEMBER',
          message: 'This person is already a member of this clinic',
        });
      }
    }

    const raw = randomBytes(32).toString('hex');

    // Any expired/cancelled leftovers for this email + clinic are closed so the
    // directory shows one current state; live invitations were rejected above.
    await this.prisma.invitation.updateMany({
      where: { email, clinicId: params.clinicId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        organizationId: clinic.organizationId,
        clinicId: params.clinicId,
        role: params.role,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: params.invitedById,
        status: 'PENDING',
        deliveryStatus: 'PENDING',
      },
    });

    return { invitation, token: raw, clinicName: clinic.name };
  }

  /**
   * Record the outcome of the mail send (FR-041, AC-048).
   *
   * Called AFTER the invitation transaction committed, so a slow or failing
   * provider can never roll back the invitation row (NFR-016). A FAILED outcome
   * is recorded, not thrown, leaving the invitation PENDING for a resend (EC-019).
   */
  async recordDelivery(invitationId: string, outcome: DeliveryOutcome): Promise<void> {
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        deliveryStatus: outcome.status,
        deliveryError: outcome.status === 'FAILED' ? (outcome.error ?? 'Unknown error') : null,
      },
    });
  }

  /** Resolve a usable invitation from its raw link token, or throw a stable code. */
  private async pendingInvitation(token: string) {
    const tokenHash = this.hashToken(token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (
      !invitation ||
      invitation.status !== 'PENDING' ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION',
        message: 'This invitation is invalid or has expired',
      });
    }
    return invitation;
  }

  /** Grant the invitation's membership and consume its single-use token. */
  private async grantInvitation(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    invitation: { id: string; organizationId: string; clinicId: string; role: UserRole },
    userId: string,
  ) {
    // Grant exactly the invited membership (FR-030).
    await tx.userMembership.upsert({
      where: { userId_clinicId: { userId, clinicId: invitation.clinicId } },
      update: { role: invitation.role, status: 'ACTIVE' },
      create: {
        userId,
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
        role: invitation.role,
        status: 'ACTIVE',
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { consumedAt: new Date(), status: 'ACCEPTED' },
    });

    await this.audit.record(tx, {
      actorUserId: userId,
      action: 'create',
      entity: 'user_membership',
      entityId: `${userId}:${invitation.clinicId}`,
      after: { role: invitation.role, via: 'invitation' },
      organizationId: invitation.organizationId,
      clinicId: invitation.clinicId,
    });
  }

  /**
   * Consume an invitation by creating a brand-new identity (FR-008, AC-016).
   *
   * This path is only for an email that has no account yet: an existing account
   * must prove ownership by signing in and then use
   * `acceptInvitationForUser`, so a leaked link can never reset someone's
   * password. The token is single-use: a second attempt is rejected (AC-017).
   */
  async acceptInvitation(params: {
    token: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (!isStrongPassword(params.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }

    const invitation = await this.pendingInvitation(params.token);

    const existing = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing) {
      throw new ConflictException({
        code: 'ACCOUNT_EXISTS',
        message: 'An account already exists for this email. Sign in to accept the invitation.',
      });
    }

    const passwordHash = await argon2.hash(params.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          firstName: params.firstName ?? '',
          lastName: params.lastName ?? '',
          isActive: true,
        },
      });

      await this.grantInvitation(tx, invitation, user.id);

      return {
        userId: user.id,
        email: user.email,
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
        role: invitation.role,
      };
    });
  }

  /**
   * Consume an invitation for an identity that already exists.
   *
   * The caller is authenticated, so the only check left is that the invitation
   * was addressed to that identity: a signed-in user cannot accept someone
   * else's invitation by pasting its link.
   */
  async acceptInvitationForUser(params: { token: string; userId: string }) {
    const invitation = await this.pendingInvitation(params.token);
    const user = await this.prisma.user.findUnique({ where: { id: params.userId } });

    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'This invitation belongs to a different email address',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.grantInvitation(tx, invitation, user.id);
      return {
        userId: user.id,
        email: user.email,
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
        role: invitation.role,
      };
    });
  }

  /**
   * Invitations for the caller's clinic, every status, paginated (FR-042, FR-048, NFR-019).
   *
   * `EXPIRED` is derived here for an unconsumed row whose `expiresAt` has passed,
   * so the directory shows one of the five statuses without any scheduled write
   * (AC-050, AC-051). The page is bounded so a read never loads the whole table.
   */
  async listInvitations(scope: TenantScope, page = 1, pageSize = 25) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = Math.max(page - 1, 0) * take;

    const where = clinicWhere(scope);
    const rows = await this.prisma.invitation.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        deliveryStatus: true,
        expiresAt: true,
        createdAt: true,
        consumedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
    const total = await this.prisma.invitation.count({ where });

    const now = Date.now();
    const items = rows.map((row: (typeof rows)[number]) => ({
      ...row,
      // Derived, never stored: a PENDING row past its expiry reads EXPIRED.
      displayStatus:
        row.status === 'PENDING' && row.expiresAt.getTime() < now ? 'EXPIRED' : row.status,
    }));

    return { items, total, page, pageSize: take };
  }

  /**
   * Pending (unconsumed, unexpired) invitations for the caller's clinic (FR-027).
   * Retained so the strict-tenant-isolation scoping test keeps a stable surface;
   * the directory uses `listInvitations`.
   */
  async listPendingInvitations(scope: TenantScope) {
    return this.prisma.invitation.findMany({
      where: { ...clinicWhere(scope), status: 'PENDING', expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cancel a PENDING invitation (FR-043, AC-053..AC-055).
   *
   * The row leaves PENDING, so a later accept can never succeed. A non-pending
   * invitation is refused with a stable code and nothing is written. The status
   * change and its audit row share one transaction (AC-054).
   */
  async cancelInvitation(id: string, actorUserId: string, scope: TenantScope): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, ...clinicWhere(scope) },
    });
    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found',
      });
    }

    if (invitation.status !== 'PENDING') {
      throw new ConflictException({
        code: 'INVITATION_NOT_PENDING',
        message: 'Only a pending invitation can be cancelled',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'CANCELLED' },
      });
      await this.audit.record(tx, {
        actorUserId,
        action: 'update',
        entity: 'invitation',
        entityId: invitation.id,
        before: { status: invitation.status },
        after: { status: 'CANCELLED' },
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
      });
    });
  }

  /**
   * Decline an invitation as the invitee (FR-044, AC-056, AC-057).
   *
   * The link token identifies the invitation; a valid, unconsumed, unexpired row
   * moves to REJECTED and its token is invalidated. No membership is created.
   */
  async declineInvitation(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (
      !invitation ||
      invitation.status !== 'PENDING' ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION',
        message: 'This invitation is invalid or has expired',
      });
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'REJECTED' },
    });
  }

  /**
   * Resolve an invitation from its link token WITHOUT consuming it (FR-046, FR-047).
   *
   * Returns the scope the accept page should render plus whether an identity
   * already exists for the invited email, so the page asks only for profile and
   * login details. The persisted row is the source of truth: the link claims are
   * never trusted over this record (AC-064).
   */
  async getInvitationByToken(token: string) {
    const tokenHash = this.hashToken(token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: { clinic: true, organization: true },
    });

    if (
      !invitation ||
      invitation.status !== 'PENDING' ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION',
        message: 'This invitation is invalid or has expired',
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: invitation.email } });

    return {
      email: invitation.email,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      clinicId: invitation.clinicId,
      clinicName: invitation.clinic.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      emailKnown: Boolean(existing),
    };
  }

  /**
   * Re-issue an invitation's token and return the fresh link (FR-031, EC-020, EC-024).
   *
   * A resend is a brand-new token: the previous token hash is replaced, so the
   * old link is dead the moment the new one is issued. Refused for an invitation
   * that is no longer PENDING (already accepted, cancelled, rejected or expired).
   */
  async resendInvitation(id: string, scope: TenantScope) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, ...clinicWhere(scope) },
      include: { clinic: true },
    });
    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found',
      });
    }

    if (invitation.status !== 'PENDING' || invitation.expiresAt.getTime() < Date.now()) {
      throw new ConflictException({
        code: 'INVITATION_NOT_PENDING',
        message: 'Only a pending invitation can be resent',
      });
    }

    const raw = randomBytes(32).toString('hex');
    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        deliveryStatus: 'PENDING',
        deliveryError: null,
      },
    });

    return { invitation: updated, token: raw, clinicName: invitation.clinic.name };
  }
}
