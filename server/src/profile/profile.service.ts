import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DATA_LOCALES,
  hasLocalized,
  normalizeLocalized,
  pickLocalized,
  type DataLocale,
  type LocalizedText,
  type ProfileDto,
  type UserRole,
} from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantContext } from '../tenancy/tenant-context';
import type { UpdateProfileDto } from './dto/profile.dto';

function unprocessable(message: string, details?: unknown) {
  return new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message, details });
}

/**
 * Canonical (single-language) value of a localized name: the clinic default language when
 * filled, else the first filled language (en, fr, ar), else the fallback.
 */
export function canonicalName(
  text: LocalizedText,
  defaultLocale: string | null | undefined,
  fallback = '',
): string {
  const preferred = text[(defaultLocale ?? '') as DataLocale];
  if (preferred) return preferred;
  for (const locale of DATA_LOCALES) {
    if (text[locale]) return text[locale] as string;
  }
  return fallback;
}

/** E.164-ish: optional +, 7 to 15 digits; spaces, dots, dashes and brackets are stripped. */
export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(compact) ? compact : null;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly cache: RedisCacheService,
  ) {}

  async get(locale: string | null): Promise<ProfileDto> {
    const scope = this.tenant.get();
    const user = await this.prisma.user.findUnique({ where: { id: scope.userId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    const access = await this.rbac.describe(scope);
    const firstNameI18n = normalizeLocalized(user.firstNameI18n);
    const lastNameI18n = normalizeLocalized(user.lastNameI18n);
    const first = pickLocalized(firstNameI18n, locale, user.firstName, access.defaultLocale);
    const last = pickLocalized(lastNameI18n, locale, user.lastName, access.defaultLocale);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      firstNameI18n,
      lastNameI18n,
      displayName: `${first} ${last}`.trim(),
      phone: user.phone,
      jobTitle: user.jobTitle,
      preferredLocale: user.preferredLocale,
      role: scope.role as UserRole,
      roleKey: access.roleKey,
      roleName: pickLocalized(access.roleName, locale, access.roleKey, access.defaultLocale),
      capabilities: access.capabilities,
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  async update(dto: UpdateProfileDto, locale: string | null): Promise<ProfileDto> {
    const scope = this.tenant.get();
    const before = await this.prisma.user.findUnique({ where: { id: scope.userId } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

    const settings = await this.prisma.clinicSettings.findUnique({
      where: { clinicId: scope.clinicId },
      select: { defaultLanguage: true },
    });
    const defaultLocale = settings?.defaultLanguage ?? 'en';

    const data: {
      firstName?: string;
      lastName?: string;
      firstNameI18n?: LocalizedText;
      lastNameI18n?: LocalizedText;
      phone?: string | null;
      jobTitle?: string | null;
      preferredLocale?: DataLocale;
    } = {};

    if (dto.firstNameI18n) {
      const text = normalizeLocalized(dto.firstNameI18n);
      if (!hasLocalized(text))
        throw unprocessable('A first name is required', { field: 'firstNameI18n' });
      data.firstNameI18n = text;
      data.firstName = canonicalName(text, defaultLocale, before.firstName);
    }
    if (dto.lastNameI18n) {
      const text = normalizeLocalized(dto.lastNameI18n);
      if (!hasLocalized(text))
        throw unprocessable('A last name is required', { field: 'lastNameI18n' });
      data.lastNameI18n = text;
      data.lastName = canonicalName(text, defaultLocale, before.lastName);
    }
    if (dto.phone !== undefined) {
      const raw = dto.phone?.trim() ?? '';
      if (!raw) {
        data.phone = null;
      } else {
        const phone = normalizePhone(raw);
        if (!phone) throw unprocessable('Invalid phone number', { field: 'phone' });
        data.phone = phone;
      }
    }
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle?.trim() || null;
    if (dto.preferredLocale) data.preferredLocale = dto.preferredLocale;

    if (Object.keys(data).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const after = await tx.user.update({ where: { id: before.id }, data });
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'update',
          entity: 'user',
          entityId: before.id,
          before: this.snapshot(before),
          after: this.snapshot(after),
        });
      });
      await this.cache.del(`user:id:${before.id}`);
      await this.cache.del(`user:email:${before.email}`);
    }
    return this.get(locale);
  }

  /** Audit snapshot without the raw phone number. */
  private snapshot(user: {
    firstName: string;
    lastName: string;
    firstNameI18n: unknown;
    lastNameI18n: unknown;
    phone: string | null;
    jobTitle: string | null;
    preferredLocale: string;
  }) {
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      firstNameI18n: user.firstNameI18n,
      lastNameI18n: user.lastNameI18n,
      hasPhone: Boolean(user.phone),
      jobTitle: user.jobTitle,
      preferredLocale: user.preferredLocale,
    };
  }
}
