import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { TenantContext } from '../tenancy/tenant-context';
import { UserRole } from '../users/user-role.enum';

/**
 * Access-token claims. `org_id`, `clinic_id` and `role` are the active tenant
 * scope (FR-003); they are the ONLY source of scope for a request (FR-004).
 */
export interface JwtPayload {
  sub: string;
  email: string;
  org_id?: string;
  clinic_id?: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly tenancy: TenancyService,
    private readonly tenantContext: TenantContext,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32chars'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session expired',
      });
    }

    // Resolve the scope from the token's clinic claim, then re-verify the
    // membership is still ACTIVE. A suspended membership must stop working
    // immediately even though its token has not expired (FR-018, AC-022).
    const scope = payload.clinic_id
      ? await this.tenancy.resolveScope(user.id, payload.clinic_id)
      : await this.tenancy.resolveDefaultScope(user.id);

    if (!scope) {
      throw new UnauthorizedException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: 'You no longer have access to this clinic',
      });
    }

    this.tenantContext.set(scope);

    // The role returned to guards is the ACTIVE membership's role, not the
    // deprecated user.role column (FR-028).
    return { ...user, role: scope.role as UserRole };
  }
}
