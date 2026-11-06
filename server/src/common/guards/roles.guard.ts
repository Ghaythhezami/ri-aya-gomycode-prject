import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITY_ROLES, type Capability } from '@riaya/shared';
import { CAPABILITY_KEY } from '../decorators/capability.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { TenantContext } from '../../tenancy/tenant-context';
import type { UserRecord } from '../../users/user.types';

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action',
  });
}

/**
 * Authorisation after JwtAuthGuard.
 *
 * - `@RequireCapability(c)`: the caller's effective capabilities in the clinic (custom role,
 *   customised system role or the default matrix, ADR 0004) must include `c`.
 * - `@Roles(...)`: legacy role list, still honoured for the few routes that use it.
 *
 * Unknown role, capability or scope means deny.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly rbac?: RbacService,
    @Optional() private readonly tenant?: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const capability = this.reflector.getAllAndOverride<Capability | undefined>(
      CAPABILITY_KEY,
      targets,
    );
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (!capability && !roles?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: UserRecord }>();
    const user = request.user;
    // `role` is the ACTIVE membership's role (jwt.strategy); a user without one never passes.
    if (!user || !user.role) throw forbidden();

    if (capability) {
      const scope = this.tenant?.peek() ?? null;
      if (this.rbac && scope) {
        if (!(await this.rbac.has(scope, capability))) throw forbidden();
      } else if (!CAPABILITY_ROLES[capability]?.includes(user.role)) {
        // No tenant scope (unit tests, non-clinic routes): the default matrix decides.
        throw forbidden();
      }
    }
    if (roles?.length && !roles.includes(user.role)) throw forbidden();
    return true;
  }
}
