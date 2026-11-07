import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { JWT_ALGORITHM, resolveJwtSecret } from '../../auth/jwt-secret';
import { PrismaService } from '../../database/prisma.service';
import {
  PORTAL_ACCESS_EXPIRES,
  PORTAL_AUDIENCE,
  PORTAL_REFRESH_COOKIE,
  PORTAL_REFRESH_DAYS,
  PORTAL_REFRESH_PATH,
  PORTAL_TOKEN_TYPE,
} from '../portal.constants';

export interface TokenAccount {
  id: string;
  clinicId: string;
  patientId: string;
}

function sessionExpired(code = 'UNAUTHENTICATED'): UnauthorizedException {
  return new UnauthorizedException({ code, message: 'Session expired' });
}

/** Access tokens (HS256, audience `riaya-portal`) and rotating refresh tokens of patients. */
@Injectable()
export class PortalTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccess(account: TokenAccount): string {
    return this.jwt.sign(
      { typ: PORTAL_TOKEN_TYPE, clinic_id: account.clinicId, patient_id: account.patientId },
      {
        secret: resolveJwtSecret(this.config),
        algorithm: JWT_ALGORITHM,
        expiresIn: PORTAL_ACCESS_EXPIRES,
        audience: PORTAL_AUDIENCE,
        subject: account.id,
      },
    );
  }

  private cookieOptions() {
    const secure =
      this.config.get('COOKIE_SECURE') === 'true' || this.config.get('NODE_ENV') === 'production';
    return { httpOnly: true, secure, sameSite: 'lax' as const, path: PORTAL_REFRESH_PATH };
  }

  setCookie(res: Response, token: string): void {
    res.cookie(PORTAL_REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: PORTAL_REFRESH_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(PORTAL_REFRESH_COOKIE, this.cookieOptions());
  }

  /** Creates a refresh token in `familyId` and sets the cookie. */
  async issueRefresh(accountId: string, familyId: string, res: Response): Promise<void> {
    const raw = randomBytes(48).toString('hex');
    await this.prisma.patientRefreshToken.create({
      data: {
        accountId,
        familyId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + PORTAL_REFRESH_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    this.setCookie(res, raw);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.patientRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Validates and consumes a refresh token. Returns the account id and the family to continue.
   * A revoked token that is presented again is a replay: the whole family is revoked.
   */
  async consume(rawToken: string | undefined, res: Response) {
    if (!rawToken) throw sessionExpired();
    const existing = await this.prisma.patientRefreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });
    if (!existing) {
      this.clearCookie(res);
      throw sessionExpired();
    }
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      this.clearCookie(res);
      throw sessionExpired('TOKEN_REUSE');
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(existing.familyId);
      this.clearCookie(res);
      throw sessionExpired();
    }
    // Atomic claim: of two concurrent uses only one rotates, the other is a replay.
    const claimed = await this.prisma.patientRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(existing.familyId);
      this.clearCookie(res);
      throw sessionExpired('TOKEN_REUSE');
    }
    return { accountId: existing.accountId, familyId: existing.familyId };
  }

  /** Revokes the family of the presented token (sign-out) and clears the cookie. */
  async revokeByRawToken(rawToken: string | undefined, res: Response): Promise<void> {
    if (rawToken) {
      const existing = await this.prisma.patientRefreshToken.findUnique({
        where: { tokenHash: this.hash(rawToken) },
      });
      if (existing) await this.revokeFamily(existing.familyId);
    }
    this.clearCookie(res);
  }
}
