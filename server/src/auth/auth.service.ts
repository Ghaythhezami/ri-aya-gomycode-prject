import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MAIL_SERVICE } from '../mail/mail.module';
import type { MailService } from '../mail/mail.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';

const FAILED_WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED = 5;
const RESET_TTL_MS = 30 * 60 * 1000;
export const REFRESH_COOKIE = 'refresh_token';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  private isLocked(user: User) {
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

    if (this.isLocked(user)) {
      this.accountLocked();
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.registerFailedLogin(user);
      this.invalidCredentials();
    }

    user.failedLoginCount = 0;
    user.failedLoginWindowStart = null;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.users.save(user);

    const accessToken = this.signAccess(user);
    await this.issueRefreshCookie(user, res, meta, randomUUID());
    return {
      accessToken,
      user: this.publicUser(user),
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
    const existing = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    if (existing.revokedAt) {
      await this.refreshTokens
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('familyId = :familyId AND revokedAt IS NULL', { familyId: existing.familyId })
        .execute();
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE',
        message: 'Session expired',
      });
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      existing.revokedAt = new Date();
      await this.refreshTokens.save(existing);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    const user = await this.users.findById(existing.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    existing.revokedAt = new Date();
    await this.refreshTokens.save(existing);
    await this.issueRefreshCookie(user, res, meta, existing.familyId);

    return {
      accessToken: this.signAccess(user),
      user: this.publicUser(user),
    };
  }

  async logout(rawToken: string | undefined, res: Response) {
    if (rawToken) {
      const tokenHash = this.hashToken(rawToken);
      const existing = await this.refreshTokens.findOne({ where: { tokenHash } });
      if (existing && !existing.revokedAt) {
        existing.revokedAt = new Date();
        await this.refreshTokens.save(existing);
      }
    }
    this.clearRefreshCookie(res);
    return { success: true };
  }

  me(user: User) {
    return this.publicUser(user);
  }

  async changePassword(user: User, currentPassword: string, newPassword: string) {
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
    await this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId: user.id })
      .execute();
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
    const entity = this.resetTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      usedAt: null,
    });
    await this.resetTokens.save(entity);

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
    const record = await this.resetTokens.findOne({ where: { tokenHash } });
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

    record.usedAt = new Date();
    await this.resetTokens.save(record);
    await this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId: user.id })
      .execute();

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
    user: User,
    res: Response,
    meta: { userAgent?: string; ip?: string },
    familyId: string,
  ) {
    const raw = randomBytes(48).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS') ?? 7);
    const entity = this.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      revokedAt: null,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });
    await this.refreshTokens.save(entity);
    this.setRefreshCookie(res, raw);
    return raw;
  }

  private signAccess(user: User) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32chars'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES', '15m'),
      },
    );
  }

  private async registerFailedLogin(user: User) {
    const now = Date.now();
    const windowStart = user.failedLoginWindowStart?.getTime() ?? 0;
    if (!windowStart || now - windowStart > FAILED_WINDOW_MS) {
      user.failedLoginWindowStart = new Date();
      user.failedLoginCount = 1;
    } else {
      user.failedLoginCount += 1;
    }
    if (user.failedLoginCount >= MAX_FAILED) {
      user.lockedUntil = new Date(now + LOCK_MS);
    }
    await this.users.save(user);
  }

  publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      preferredLocale: user.preferredLocale,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
