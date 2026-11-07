import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import type { PortalAuthResponse, PortalMe } from '@riaya/shared';
import { normalizeLocalized, pickLocalized } from '@riaya/shared';
import { AuditService } from '../../audit/audit.service';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { RequestLocale } from '../../common/locale/request-locale';
import { buildSearchText, resolveNameInput } from '../../common/locale/localized-input';
import {
  isStrongPassword,
  PASSWORD_POLICY_MESSAGE,
} from '../../common/validators/password-strength';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_SERVICE } from '../../mail/mail.module';
import type { MailService } from '../../mail/mail.service';
import { normalisePhone } from '../../patients/patients.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  PortalAcceptInviteDto,
  PortalForgotPasswordDto,
  PortalLoginDto,
  PortalRegisterDto,
  PortalResetPasswordDto,
} from '../dto/portal-auth.dto';
import { toPortalMe, type AccountWithPatient } from '../portal-me.mapper';
import { PortalTokenService } from './portal-token.service';

export const PORTAL_LOGIN_MAX_ATTEMPTS = 5;
const FAIL_WINDOW_SECONDS = 10 * 60;
const LOCKOUT_SECONDS = 15 * 60;
const FAIL_PREFIX = 'portal:fail:';
const LOCK_PREFIX = 'portal:lock:';
/** Lock a (clinic, e-mail, IP) triple after 5 failures, and the e-mail alone after 20. */
export const PORTAL_LOGIN_MAX_ATTEMPTS_EMAIL = 20;
const EMAIL_FAIL_PREFIX = 'portal:fail-email:';
const EMAIL_LOCK_PREFIX = 'portal:lock-email:';
/** Wrong birth dates tolerated per invite before it is revoked. */
export const INVITE_MAX_ATTEMPTS = 5;
const INVITE_FAIL_PREFIX = 'portal:invite-fail:';
const INVITE_FAIL_WINDOW_SECONDS = 7 * 24 * 3600;

/** A portal password reset link is valid for 30 minutes. */
export const PORTAL_RESET_TTL_MS = 30 * 60 * 1000;

const ACCOUNT_INCLUDE = { patient: true } satisfies Prisma.PatientAccountInclude;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function accountExists(): ConflictException {
  return new ConflictException({
    code: 'ACCOUNT_EXISTS',
    message: 'An account could not be created with these details',
  });
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
}

function invalidInvite(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_TOKEN',
    message: 'This invitation is invalid or has expired',
  });
}

function invalidReset(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_TOKEN',
    message: 'This reset link is invalid or has expired',
  });
}

function weakPassword(): BadRequestException {
  return new BadRequestException({ code: 'WEAK_PASSWORD', message: PASSWORD_POLICY_MESSAGE });
}

function parseDob(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date > new Date()
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid date of birth',
      details: { field: 'dateOfBirth' },
    });
  }
  return date;
}

/** Compares two YYYY-MM-DD strings without an early exit on the first differing character. */
function sameDate(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function localeOf(value: string | null | undefined): 'en' | 'fr' | 'ar' {
  return value === 'fr' || value === 'ar' ? value : 'en';
}

@Injectable()
export class PortalAuthService {
  private dummyHash: Promise<string> | null = null;
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: PortalTokenService,
    private readonly redis: RedisCacheService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ shared

  private async clinicInfo(clinicId: string): Promise<{ name: string; timezone: string }> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, nameI18n: true, timezone: true },
    });
    if (!clinic) return { name: '', timezone: 'UTC' };
    return {
      name: pickLocalized(normalizeLocalized(clinic.nameI18n), RequestLocale.get(), clinic.name),
      timezone: clinic.timezone,
    };
  }

  async meFor(accountId: string): Promise<PortalMe> {
    const account = await this.prisma.patientAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: ACCOUNT_INCLUDE,
    });
    const clinic = await this.clinicInfo(account.clinicId);
    return toPortalMe(account as AccountWithPatient, clinic.name, clinic.timezone);
  }

  private async respond(
    account: { id: string; clinicId: string; patientId: string },
    familyId: string,
    res: Response,
  ): Promise<PortalAuthResponse> {
    await this.tokens.issueRefresh(account.id, familyId, res);
    return { accessToken: this.tokens.signAccess(account), me: await this.meFor(account.id) };
  }

  private async nextPatientCode(tx: Prisma.TransactionClient, clinicId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)::int AS max
      FROM patients WHERE "clinicId" = ${clinicId} AND code ~ '^P-[0-9]+$'`;
    return `P-${String((rows[0]?.max ?? 0) + 1).padStart(3, '0')}`;
  }

  // ------------------------------------------------------------------ register

  async register(dto: PortalRegisterDto, res: Response): Promise<PortalAuthResponse> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: dto.clinicId },
      select: { id: true, organizationId: true },
    });
    const settings = clinic
      ? await this.prisma.clinicSettings.findUnique({
          where: { clinicId: clinic.id },
          select: {
            patientPortalEnabled: true,
            patientSelfRegistration: true,
            defaultLanguage: true,
          },
        })
      : null;
    // Unknown clinic and disabled self-registration answer the same way (no clinic enumeration).
    if (
      !clinic ||
      (settings && (!settings.patientPortalEnabled || !settings.patientSelfRegistration))
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Self-registration is not available for this clinic',
      });
    }
    if (!isStrongPassword(dto.password)) throw weakPassword();

    const dateOfBirth = parseDob(dto.dateOfBirth);
    const lang = settings?.defaultLanguage ?? null;
    const first = resolveNameInput('firstName', undefined, dto.firstNameI18n, lang);
    const last = resolveNameInput('lastName', undefined, dto.lastNameI18n, lang);
    const phone = dto.phone.trim();

    // Hash BEFORE the existence check so a taken e-mail costs the same time as a free one.
    // Residual risk: 409 ACCOUNT_EXISTS still tells a caller that an e-mail is registered at this
    // clinic (the form needs it to guide the user); the IP throttle (5/min) bounds enumeration.
    const passwordHash = await argon2.hash(dto.password);

    const emailTaken = await this.prisma.patientAccount.findUnique({
      where: { clinicId_email: { clinicId: clinic.id, email: dto.email } },
      select: { id: true },
    });
    if (emailTaken) throw accountExists();

    // Same phone and birth date as an existing record: flag for staff review, never link.
    const sameBirth = await this.prisma.patient.findMany({
      where: { clinicId: clinic.id, dateOfBirth, status: 'ACTIVE' },
      select: { id: true, phone: true },
    });
    const digits = normalisePhone(phone);
    const duplicate = digits
      ? sameBirth.find((p) => normalisePhone(p.phone) === digits)
      : undefined;

    const now = new Date();

    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.prisma.$transactionWith(async (tx) => {
          const code = await this.nextPatientCode(tx, clinic.id);
          const patient = await tx.patient.create({
            data: {
              clinicId: clinic.id,
              code,
              firstName: first.canonical,
              lastName: last.canonical,
              firstNameI18n: first.i18n,
              lastNameI18n: last.i18n,
              searchText: buildSearchText([
                first.canonical,
                first.i18n,
                last.canonical,
                last.i18n,
                code,
                phone,
                dto.email,
              ]),
              dateOfBirth,
              phone,
              email: dto.email,
              source: 'PORTAL',
              possibleDuplicateOfId: duplicate?.id ?? null,
            },
          });
          const account = await tx.patientAccount.create({
            data: {
              clinicId: clinic.id,
              patientId: patient.id,
              email: dto.email,
              passwordHash,
              preferredLocale: dto.preferredLocale,
              privacyAcceptedAt: now,
              aiConsentAt: dto.aiConsent ? now : null,
            },
          });
          await this.audit.record(tx, {
            action: 'create',
            entity: 'patient_account',
            entityId: account.id,
            organizationId: clinic.organizationId,
            clinicId: clinic.id,
            after: {
              patientId: patient.id,
              source: 'PORTAL',
              possibleDuplicateOfId: duplicate?.id ?? null,
              aiConsent: Boolean(dto.aiConsent),
            },
          });
          return { account, patient };
        });

        if (duplicate) {
          await this.notifications.create({
            clinicId: clinic.id,
            category: 'SYSTEM',
            titleKey: 'notifications.templates.portalDuplicate.title',
            bodyKey: 'notifications.templates.portalDuplicate.body',
            params: { patient: created.patient.code },
            entityType: 'patient',
            entityId: created.patient.id,
            dedupeKey: `portal.duplicate:${created.patient.id}`,
          });
        }
        return await this.respond(created.account, randomUUID(), res);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Either the e-mail was taken meanwhile, or two sign-ups raced for the same patient code.
        const taken = await this.prisma.patientAccount.findUnique({
          where: { clinicId_email: { clinicId: clinic.id, email: dto.email } },
          select: { id: true },
        });
        if (taken || attempt >= 2) throw accountExists();
      }
    }
  }

  // ------------------------------------------------------------------ accept invite

  /**
   * Counts a failed invite attempt (wrong birth date) and revokes the invite at the limit, so the
   * token cannot be brute-forced against the date of birth.
   */
  private async inviteFailure(inviteId: string): Promise<void> {
    const attempts = await this.redis.incrementStrict(
      `${INVITE_FAIL_PREFIX}${inviteId}`,
      INVITE_FAIL_WINDOW_SECONDS,
    );
    if (attempts >= INVITE_MAX_ATTEMPTS) {
      await this.prisma.patientInvite.updateMany({
        where: { id: inviteId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }
  }

  async acceptInvite(dto: PortalAcceptInviteDto, res: Response): Promise<PortalAuthResponse> {
    if (!isStrongPassword(dto.password)) throw weakPassword();
    // Hash first: unknown token, wrong birth date and an existing account all take the same time.
    const passwordHash = await argon2.hash(dto.password);
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invite = await this.prisma.patientInvite.findUnique({ where: { tokenHash } });
    if (!invite || invite.consumedAt || invite.expiresAt.getTime() <= Date.now()) {
      throw invalidInvite();
    }
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: invite.clinicId },
      select: { organizationId: true },
    });
    const settings = await this.prisma.clinicSettings.findUnique({
      where: { clinicId: invite.clinicId },
      select: { defaultLanguage: true, patientPortalEnabled: true },
    });
    if (!clinic || (settings && !settings.patientPortalEnabled)) throw invalidInvite();

    // The link alone is not enough: the birth date must match the patient record. A mismatch
    // answers the same generic INVALID_TOKEN and counts toward the per-invite attempt limit.
    const record = await this.prisma.patient.findFirst({
      where: { id: invite.patientId, clinicId: invite.clinicId },
      select: { dateOfBirth: true },
    });
    const expected = record ? record.dateOfBirth.toISOString().slice(0, 10) : '';
    if (!record || !sameDate(String(dto.dateOfBirth ?? ''), expected)) {
      await this.inviteFailure(invite.id);
      throw invalidInvite();
    }

    const now = new Date();
    const locale = localeOf(RequestLocale.get() ?? settings?.defaultLanguage);

    let account: { id: string; clinicId: string; patientId: string };
    let patientCode = '';
    try {
      account = await this.prisma.$transactionWith(async (tx) => {
        // Atomic one-time claim: of two concurrent requests exactly one gets count === 1.
        const claim = await tx.patientInvite.updateMany({
          where: { id: invite.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claim.count !== 1) throw invalidInvite();

        const patient = await tx.patient.findFirst({
          where: { id: invite.patientId, clinicId: invite.clinicId },
          select: { id: true, code: true, status: true },
        });
        if (!patient || patient.status !== 'ACTIVE') throw invalidInvite();
        patientCode = patient.code ?? '';
        const existing = await tx.patientAccount.findUnique({
          where: { patientId: patient.id },
          select: { id: true },
        });
        if (existing) throw accountExists();

        const created = await tx.patientAccount.create({
          data: {
            clinicId: invite.clinicId,
            patientId: patient.id,
            email: dto.email,
            passwordHash,
            preferredLocale: locale,
            privacyAcceptedAt: now,
            aiConsentAt: dto.aiConsent ? now : null,
            // `emailVerifiedAt` doubles as "identity verified by the clinic": the desk issued
            // this invite for a known patient and the birth date matched.
            emailVerifiedAt: now,
          },
        });
        await this.audit.record(tx, {
          action: 'create',
          entity: 'patient_account',
          entityId: created.id,
          organizationId: clinic.organizationId,
          clinicId: invite.clinicId,
          after: { patientId: patient.id, source: 'INVITE', inviteId: invite.id },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw accountExists();
      throw error;
    }
    await this.notifications
      .create({
        clinicId: invite.clinicId,
        category: 'SYSTEM',
        titleKey: 'notifications.templates.portalLinked.title',
        bodyKey: 'notifications.templates.portalLinked.body',
        params: { patient: patientCode },
        entityType: 'patient',
        entityId: invite.patientId,
        dedupeKey: `portal.linked:${invite.patientId}`,
      })
      .catch(() => undefined);
    return this.respond(account, randomUUID(), res);
  }

  // ------------------------------------------------------------------ forgot / reset password

  /**
   * Always resolves `{ success: true }`: an unknown account, an inactive account and a mail failure
   * are indistinguishable to the caller (no account enumeration).
   */
  async forgotPassword(dto: PortalForgotPasswordDto): Promise<{ success: true }> {
    try {
      const account = await this.prisma.patientAccount.findUnique({
        where: { clinicId_email: { clinicId: dto.clinicId, email: dto.email } },
        include: ACCOUNT_INCLUDE,
      });
      if (!account || !account.isActive || account.patient.status !== 'ACTIVE') {
        return { success: true };
      }

      const raw = randomBytes(32).toString('hex');
      const now = new Date();
      // Invalidate earlier unused links, then store only the hash of the new one.
      await this.prisma.patientPasswordResetToken.updateMany({
        where: { accountId: account.id, usedAt: null },
        data: { usedAt: now },
      });
      await this.prisma.patientPasswordResetToken.create({
        data: {
          accountId: account.id,
          tokenHash: createHash('sha256').update(raw).digest('hex'),
          expiresAt: new Date(now.getTime() + PORTAL_RESET_TTL_MS),
        },
      });

      const backoffice = this.config.get<string>('BACKOFFICE_URL') ?? 'http://localhost:5174';
      // Fragment, so the token never reaches server or proxy logs.
      const resetUrl = `${backoffice}/portal/reset-password#token=${raw}`;
      const clinic = await this.clinicInfo(account.clinicId);
      await this.mail.sendPortalPasswordReset({
        email: account.email,
        resetUrl,
        clinicName: clinic.name,
        locale: localeOf(account.preferredLocale),
      });
    } catch (error) {
      // Never log the address or the link, only the error class.
      this.logger.warn(
        `Portal password reset request failed: ${(error as Error)?.name ?? 'Error'}`,
      );
    }
    return { success: true };
  }

  async resetPassword(dto: PortalResetPasswordDto): Promise<{ success: true }> {
    if (!isStrongPassword(dto.password)) throw weakPassword();
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.patientPasswordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw invalidReset();
    }
    const account = await this.prisma.patientAccount.findUnique({
      where: { id: record.accountId },
    });
    if (!account || !account.isActive) throw invalidReset();

    const passwordHash = await argon2.hash(dto.password);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: account.clinicId },
      select: { organizationId: true },
    });
    const now = new Date();
    await this.prisma.$transactionWith(async (tx) => {
      // Atomic one-time claim: of two concurrent requests exactly one gets count === 1.
      const claim = await tx.patientPasswordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claim.count !== 1) throw invalidReset();
      await tx.patientAccount.update({
        where: { id: account.id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.patientRefreshToken.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (clinic) {
        await this.audit.record(tx, {
          action: 'update',
          entity: 'patient_account',
          entityId: account.id,
          organizationId: clinic.organizationId,
          clinicId: account.clinicId,
          after: { event: 'password_reset' },
        });
      }
    });

    // Clear the e-mail-wide lockout; per-IP keys expire on their own (the IP hash is not known).
    const key = `${account.clinicId}:${account.email.toLowerCase()}`;
    await this.redis.delStrict(`${EMAIL_FAIL_PREFIX}${key}`).catch(() => undefined);
    await this.redis.delStrict(`${EMAIL_LOCK_PREFIX}${key}`).catch(() => undefined);
    return { success: true };
  }

  // ------------------------------------------------------------------ login / refresh / logout

  /**
   * Failures are counted per (clinic, e-mail, IP) and, with a higher ceiling, per (clinic, e-mail).
   * One attacker IP locks only its own triple, so it cannot lock the real owner out; a
   * distributed guessing attack still hits the e-mail-wide limit.
   */
  private async registerFailure(pair: string, email: string): Promise<void> {
    const attempts = await this.redis.incrementStrict(`${FAIL_PREFIX}${pair}`, FAIL_WINDOW_SECONDS);
    if (attempts >= PORTAL_LOGIN_MAX_ATTEMPTS) {
      await this.redis.setStrict(`${LOCK_PREFIX}${pair}`, 1, LOCKOUT_SECONDS);
      await this.redis.delStrict(`${FAIL_PREFIX}${pair}`);
    }
    const perEmail = await this.redis.incrementStrict(
      `${EMAIL_FAIL_PREFIX}${email}`,
      FAIL_WINDOW_SECONDS,
    );
    if (perEmail >= PORTAL_LOGIN_MAX_ATTEMPTS_EMAIL) {
      await this.redis.setStrict(`${EMAIL_LOCK_PREFIX}${email}`, 1, LOCKOUT_SECONDS);
      await this.redis.delStrict(`${EMAIL_FAIL_PREFIX}${email}`);
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('portal-timing-equaliser');
    return this.dummyHash;
  }

  async login(dto: PortalLoginDto, res: Response, ip = 'unknown'): Promise<PortalAuthResponse> {
    // Strict store: when Redis is unreachable this throws and login fails closed.
    // Keyed by clinic + e-mail (+ IP) whether or not the account exists (no enumeration).
    const email = `${dto.clinicId}:${dto.email.toLowerCase()}`;
    const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
    const pair = `${email}:${ipHash}`;
    const ttl = Math.max(
      await this.redis.ttlStrict(`${LOCK_PREFIX}${pair}`),
      await this.redis.ttlStrict(`${EMAIL_LOCK_PREFIX}${email}`),
    );
    if (ttl > 0) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Too many attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`,
        details: { retryAfterSeconds: ttl },
      });
    }

    const account = await this.prisma.patientAccount.findUnique({
      where: { clinicId_email: { clinicId: dto.clinicId, email: dto.email } },
      include: ACCOUNT_INCLUDE,
    });
    // Always run one hash verification so timing does not reveal whether the account exists.
    const hash = account?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, dto.password).catch(() => false);
    if (!account || !valid || !account.isActive || account.patient.status !== 'ACTIVE') {
      await this.registerFailure(pair, email);
      throw invalidCredentials();
    }

    await this.redis.delStrict(`${FAIL_PREFIX}${pair}`);
    await this.redis.delStrict(`${LOCK_PREFIX}${pair}`);
    await this.prisma.patientAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    return this.respond(account, randomUUID(), res);
  }

  async refresh(rawToken: string | undefined, res: Response): Promise<PortalAuthResponse> {
    const { accountId, familyId } = await this.tokens.consume(rawToken, res);
    const account = await this.prisma.patientAccount.findUnique({
      where: { id: accountId },
      include: ACCOUNT_INCLUDE,
    });
    if (!account || !account.isActive || account.patient.status !== 'ACTIVE') {
      await this.tokens.revokeFamily(familyId);
      this.tokens.clearCookie(res);
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }
    return this.respond(account, familyId, res);
  }

  async logout(rawToken: string | undefined, res: Response): Promise<{ success: true }> {
    await this.tokens.revokeByRawToken(rawToken, res);
    return { success: true };
  }
}
