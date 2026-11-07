import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JWT_ALGORITHM, resolveJwtSecret } from '../../auth/jwt-secret';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { PrismaService } from '../../database/prisma.service';
import { PORTAL_AUDIENCE, PORTAL_TOKEN_TYPE } from '../portal.constants';
import { PatientContext, type PortalPrincipal } from './patient-context';

export interface PortalJwtPayload {
  sub: string;
  typ: string;
  aud: string;
  clinic_id: string;
  patient_id: string;
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
}

function toLocale(value: string): PortalPrincipal['locale'] {
  return value === 'fr' || value === 'ar' ? value : 'en';
}

/**
 * Guard for patient routes. Accepts only HS256 tokens with `aud = riaya-portal` and
 * `typ = patient`, then re-loads the account (active, patient not archived) so a disabled
 * account stops working before its token expires. Sets `PatientContext` and `request.patient`.
 */
@Injectable()
export class PortalJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly patient: PatientContext,
    private readonly cache: RedisCacheService,
  ) {}

  /** Kill switch: the clinic flag is cached 60 s so it is not read on every request. */
  private async portalEnabled(clinicId: string): Promise<boolean> {
    const key = `portal:enabled:${clinicId}`;
    const cached = await this.cache.get<boolean>(key);
    if (typeof cached === 'boolean') return cached;
    const row = await this.prisma.clinicSettings.findUnique({
      where: { clinicId },
      select: { patientPortalEnabled: true },
    });
    const enabled = row?.patientPortalEnabled ?? true;
    await this.cache.set(key, enabled, 60);
    return enabled;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { patient?: PortalPrincipal }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthenticated();

    let payload: PortalJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<PortalJwtPayload>(token, {
        secret: resolveJwtSecret(this.config),
        algorithms: [JWT_ALGORITHM],
        audience: PORTAL_AUDIENCE,
      });
    } catch {
      throw unauthenticated();
    }
    if (payload.typ !== PORTAL_TOKEN_TYPE || !payload.sub || !payload.clinic_id) {
      throw unauthenticated();
    }

    const account = await this.prisma.patientAccount.findFirst({
      where: { id: payload.sub, clinicId: payload.clinic_id, patientId: payload.patient_id },
      include: { patient: { select: { status: true, clinicId: true } } },
    });
    if (
      !account ||
      !account.isActive ||
      account.patient.status !== 'ACTIVE' ||
      account.patient.clinicId !== account.clinicId
    ) {
      throw unauthenticated();
    }

    if (!(await this.portalEnabled(account.clinicId))) {
      throw new ForbiddenException({
        code: 'PORTAL_DISABLED',
        message: 'The patient portal is not available for this clinic',
      });
    }

    const principal: PortalPrincipal = {
      accountId: account.id,
      patientId: account.patientId,
      clinicId: account.clinicId,
      locale: toLocale(account.preferredLocale),
    };
    this.patient.set(principal);
    request.patient = principal;
    return true;
  }
}
