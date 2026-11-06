import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ONBOARDING_STEPS,
  hasLocalized,
  normalizeLocalized,
  type OnboardingState,
  type OnboardingStep,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantContext } from '../tenancy/tenant-context';

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

/**
 * Setup checklist of the signed-in user and, for administrators, of the clinic (ADR 0004).
 * Not to be confused with the tenancy OnboardingService, which registers organizations.
 */
@Injectable()
export class OnboardingStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly cache: RedisCacheService,
  ) {}

  async state(): Promise<OnboardingState> {
    const scope = this.tenant.get();
    const user = await this.prisma.user.findUnique({ where: { id: scope.userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

    const done: Partial<Record<OnboardingStep, boolean>> = {
      profile:
        Boolean(user.onboardingCompletedAt) ||
        Boolean(user.phone) ||
        Boolean(user.jobTitle) ||
        hasLocalized(normalizeLocalized(user.firstNameI18n)) ||
        hasLocalized(normalizeLocalized(user.lastNameI18n)),
    };

    const isAdmin = await this.rbac.has(scope, 'manageSettings');
    let completed = Boolean(user.onboardingCompletedAt);
    if (isAdmin) {
      const now = new Date();
      const [clinic, settings, types, doctors, members, invitations] = await Promise.all([
        this.prisma.clinic.findFirst({ where: { id: scope.clinicId } }),
        this.prisma.clinicSettings.findUnique({
          where: { clinicId: scope.clinicId },
          select: { openingHours: true },
        }),
        this.prisma.appointmentTypeDef
          ? this.prisma.appointmentTypeDef.count({
              where: { clinicId: scope.clinicId, isActive: true },
            })
          : Promise.resolve(0),
        this.prisma.doctor.count({ where: { clinicId: scope.clinicId, isActive: true } }),
        this.prisma.userMembership.count({
          where: { clinicId: scope.clinicId, status: 'ACTIVE', id: { not: scope.membershipId } },
        }),
        this.prisma.invitation.count({
          where: { clinicId: scope.clinicId, consumedAt: null, expiresAt: { gt: now } },
        }),
      ]);
      done.clinic =
        hasLocalized(normalizeLocalized(clinic?.nameI18n)) || Boolean(clinic?.address?.trim());
      done.hours = isFilled(settings?.openingHours);
      done.appointmentTypes = types > 0;
      done.doctors = doctors > 0;
      done.team = members > 0 || invitations > 0;
      completed = Boolean(clinic?.onboardingCompletedAt);
    }

    return {
      completed,
      steps: ONBOARDING_STEPS.filter((key) => key in done).map((key) => ({
        key,
        done: Boolean(done[key]),
      })),
    };
  }

  async complete(target: 'user' | 'clinic'): Promise<OnboardingState> {
    const scope = this.tenant.get();
    const now = new Date();
    if (target === 'clinic') {
      if (!(await this.rbac.has(scope, 'manageSettings'))) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        });
      }
      await this.prisma.$transaction(async (tx) => {
        const clinic = await tx.clinic.update({
          where: { id: scope.clinicId },
          data: { onboardingCompletedAt: now },
        });
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'update',
          entity: 'clinic',
          entityId: clinic.id,
          after: { onboardingCompletedAt: now.toISOString() },
        });
      });
    } else {
      const user = await this.prisma.user.findUnique({ where: { id: scope.userId } });
      if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { onboardingCompletedAt: now } });
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'update',
          entity: 'user',
          entityId: user.id,
          after: { onboardingCompletedAt: now.toISOString() },
        });
      });
      await this.cache.del(`user:id:${user.id}`);
      await this.cache.del(`user:email:${user.email}`);
    }
    return this.state();
  }
}
