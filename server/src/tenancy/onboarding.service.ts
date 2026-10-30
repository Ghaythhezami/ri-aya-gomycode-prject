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
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';

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
   */
  async invite(params: { email: string; clinicId: string; role: UserRole; invitedById: string }) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: params.clinicId } });
    if (!clinic) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }

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
        role: params.role,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: params.invitedById,
      },
    });

    return { invitation, token: raw, clinicName: clinic.name };
  }

  /**
   * Consume an invitation and set the invitee's password (FR-008, AC-016).
   * The token is single-use: a second attempt is rejected (AC-017).
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

    const tokenHash = this.hashToken(params.token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.consumedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION',
        message: 'This invitation is invalid or has expired',
      });
    }

    const passwordHash = await argon2.hash(params.password);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: invitation.email } });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: params.firstName ?? '',
            lastName: params.lastName ?? '',
            isActive: true,
          },
        }));

      if (existing) {
        await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
      }

      // Grant exactly the invited membership (FR-030).
      await tx.userMembership.upsert({
        where: { userId_clinicId: { userId: user.id, clinicId: invitation.clinicId } },
        update: { role: invitation.role, status: 'ACTIVE' },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          clinicId: invitation.clinicId,
          role: invitation.role,
          status: 'ACTIVE',
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date() },
      });

      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'create',
        entity: 'user_membership',
        entityId: `${user.id}:${invitation.clinicId}`,
        after: { role: invitation.role, via: 'invitation' },
        organizationId: invitation.organizationId,
        clinicId: invitation.clinicId,
      });

      return { userId: user.id, clinicId: invitation.clinicId, role: invitation.role };
    });
  }

  /** Guard used by the invitation endpoint: only admins may invite (FR-007). */
  assertCanInvite(role: UserRole): void {
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.CLINIC_ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only clinic admins can invite staff',
      });
    }
  }

  /** Pending (unconsumed, unexpired) invitations for a clinic (FR-027). */
  async listPendingInvitations(clinicId: string) {
    return this.prisma.invitation.findMany({
      where: { clinicId, consumedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
