import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import type { UserRecord } from '../users/user.types';
import { PrismaService } from '../database/prisma.service';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { MailService } from '../mail/mail.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';
import { LoginAttemptService } from '../cache/login-attempt.service';
import { TokenBlacklistService } from '../cache/token-blacklist.service';
import { TenancyService } from '../tenancy/tenancy.service';
import type { TenantScope } from '../tenancy/tenant-context';
import type { UserRole } from '../users/user-role.enum';

const RESET_TTL_MS = 30 * 60 * 1000;
export const REFRESH_COOKIE = 'refresh_token';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly blacklist: TokenBlacklistService,
    private readonly tenancy: TenancyService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidCredentials(): never {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
  }

  private accountLocked(): never {
    throw new UnauthorizedException({
      code: 'ACCOUNT_LOCKED',
      message: 'Invalid credentials',
    });
  }

  private isLocked(user: UserRecord) {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  }

  async login(
    email: string,
    password: string,
    res: Response,
    meta: { userAgent?: string; ip?: string },
  ) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) {
      this.invalidCredentials();
    }

    // Lockout is Redis-backed (FR-014). A Redis outage throws here, so login
    // fails closed instead of permitting unlimited attempts (NFR-009).
    const lockout = await this.loginAttempts.getLockout(user.email);
    if (lockout.locked) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Account temporarily locked. Try again in ${Math.ceil(lockout.remainingSeconds / 60)} minute(s).`,
      });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.registerFailedLogin(user);
      this.invalidCredentials();
    }

    await this.loginAttempts.clear(user.email);
    user.lastLoginAt = new Date();
    await this.users.save(user);

    // Issue a token scoped to the user's active membership (FR-003).
    const scope = await this.tenancy.resolveDefaultScope(user.id);
    const accessToken = this.signAccess(user, scope);
    await this.issueRefreshCookie(user, res, meta, randomUUID());
    return {
      accessToken,
      user: this.publicUser(user, scope?.role ?? null),
      scope,
    };
  }

  async refresh(
    rawToken: string | undefined,
    res: Response,
    meta: { userAgent?: string; ip?: string },
  ) {
    if (!rawToken) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    if (existing.revokedAt || (await this.blacklist.isRevoked(tokenHash))) {
      await this.revokeFamily(existing.familyId);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE',
        message: 'Session expired',
      });
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    const user = await this.users.findById(existing.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    // Rotate: revoke the presented token in both stores before issuing the next
    // one in the same family (FR-010, FR-015).
    // Known defect (debug report D5, fix blocked): the new token is issued with
    // no clinic scope, so a refresh after a workspace switch falls back to the
    // default clinic. Fixing it needs a `clinicId` column on refresh_tokens
    // plus `prisma generate` and a migration.
    await this.revokeToken(existing.tokenHash, existing.expiresAt);
    await this.issueRefreshCookie(user, res, meta, existing.familyId);

    // Report the active membership role rather than the deprecated identity
    // column, so a refreshed session never reports `role: null` (D13).
    const scope = await this.tenancy.resolveDefaultScope(user.id);

    return {
      accessToken: this.signAccess(user),
      user: this.publicUser(user, scope?.role ?? null),
    };
  }

  async logout(rawToken: string | undefined, res: Response) {
    if (rawToken) {
      const tokenHash = this.hashToken(rawToken);
      const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (existing && !existing.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
        await this.revokeToken(existing.tokenHash, existing.expiresAt);
      }
    }
    this.clearRefreshCookie(res);
    return { success: true };
  }

  me(user: UserRecord) {
    return this.publicUser(user);
  }

  async changePassword(user: UserRecord, currentPassword: string, newPassword: string) {
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }
    user.passwordHash = await argon2.hash(newPassword);
    await this.users.save(user);
    await this.revokeAllRefreshTokens(user.id);
    return { success: true };
  }

  async forgotPassword(email: string) {
    const generic = {
      success: true,
      message: 'If an account exists for this email, a reset link has been sent',
    };
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) {
      return generic;
    }

    const raw = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        usedAt: null,
      },
    });

    const backoffice = this.config.get<string>('BACKOFFICE_URL', 'http://localhost:5173');
    const resetUrl = `${backoffice}/reset-password?token=${raw}`;
    await this.mail.sendPasswordReset(user.email, resetUrl);
    return generic;
  }

  async resetPassword(token: string, password: string) {
    if (!isStrongPassword(password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired',
      });
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired',
      });
    }

    user.passwordHash = await argon2.hash(password);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.users.save(user);

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await this.revokeAllRefreshTokens(user.id);

    return { success: true };
  }

  setRefreshCookie(res: Response, token: string) {
    const days = Number(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS') ?? 7);
    const secure =
      this.config.get('COOKIE_SECURE') === 'true' || this.config.get('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  clearRefreshCookie(res: Response) {
    const secure =
      this.config.get('COOKIE_SECURE') === 'true' || this.config.get('NODE_ENV') === 'production';
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private async issueRefreshCookie(
    user: UserRecord,
    res: Response,
    meta: { userAgent?: string; ip?: string },
    familyId: string,
  ) {
    const raw = randomBytes(48).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS') ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        revokedAt: null,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });
    this.setRefreshCookie(res, raw);
    return raw;
  }

  private signAccess(user: UserRecord, scope?: TenantScope | null) {
    return this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        // Active tenant scope (FR-003). Absent only for a user with no
        // membership yet, which the strategy rejects on the next request.
        org_id: scope?.organizationId,
        clinic_id: scope?.clinicId,
        role: scope?.role ?? user.role,
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32chars'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES', '15m'),
      },
    );
  }

  /**
   * Re-issue an access token scoped to another clinic the caller belongs to
   * (FR-011). Rejects with 403 when they hold no ACTIVE membership there
   * (FR-012, AC-014) — never silently falls back to another clinic.
   */
  async switchWorkspace(
    user: UserRecord,
    clinicId: string,
    res: Response,
    meta: { userAgent?: string; ip?: string },
  ) {
    const scope = await this.tenancy.resolveScope(user.id, clinicId);
    if (!scope) {
      throw new ForbiddenException({
        code: 'NO_MEMBERSHIP',
        message: 'You do not have access to that clinic',
      });
    }

    const accessToken = this.signAccess(user, scope);
    // Rotate the refresh token so the new scope is not tied to the old one.
    await this.issueRefreshCookie(user, res, meta, randomUUID());
    return { accessToken, scope };
  }

  /** Active memberships for the workspace switcher (FR-032). */
  async listMemberships(user: UserRecord) {
    return this.tenancy.listMemberships(user.id);
  }

  /**
   * Revoke one refresh token. PostgreSQL stays the source of truth for rotation
   * and family rules; Redis is the shared revocation list whose TTL matches the
   * token's remaining life (FR-015, AC-040).
   */
  private async revokeToken(tokenHash: string, expiresAt: Date): Promise<void> {
    const remainingSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.blacklist.revoke(tokenHash, remainingSeconds);
  }

  /** Revoke a whole refresh-token family in both stores (FR-010). */
  private async revokeFamily(familyId: string): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: { familyId, revokedAt: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    for (const token of active) {
      await this.revokeToken(token.tokenHash, token.expiresAt);
    }
  }

  /** Revoke every active refresh token of a user, in both stores (FR-022). */
  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    for (const token of active) {
      await this.revokeToken(token.tokenHash, token.expiresAt);
    }
  }

  private async registerFailedLogin(user: UserRecord) {
    // Lockout state lives in Redis (FR-014). If Redis is unreachable this
    // throws, and login fails closed rather than allowing unlimited attempts
    // (NFR-009, AC-031).
    await this.loginAttempts.registerFailure(user.email);
  }

  publicUser(user: UserRecord, role?: UserRole | null) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      // The ACTIVE membership's role is authoritative (FR-028). `user.role` is the
      // deprecated identity column and is NULL for anyone who self-registered, so
      // relying on it reported `role: null` for every new owner (D13).
      role: role ?? user.role,
      preferredLocale: user.preferredLocale,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
