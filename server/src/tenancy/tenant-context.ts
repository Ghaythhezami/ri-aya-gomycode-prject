import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { UserRole } from '../users/user-role.enum';

/** The tenant scope resolved from a verified access token. */
export interface TenantScope {
  userId: string;
  organizationId: string;
  clinicId: string;
  role: UserRole;
  membershipId: string;
}

/**
 * Request-scoped holder for the active tenant.
 *
 * Populated ONLY from the verified JWT (FR-004). Nothing in a request body or
 * query string may widen or change this scope — that is the whole point of
 * AC-025: a caller who supplies a different `clinic_id` is ignored, not obeyed.
 *
 * Isolation comes from `AsyncLocalStorage` rather than Nest's `Scope.REQUEST`
 * on purpose. A REQUEST-scoped provider bubbles its scope into every consumer,
 * which turned `JwtStrategy` request-scoped; Nest then never constructed it at
 * bootstrap, so `PassportStrategy` never registered the "jwt" strategy and every
 * guarded route failed with `Unknown authentication strategy "jwt"`. Keeping
 * this a singleton preserves per-request isolation without poisoning the
 * passport strategy.
 */
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  set(scope: TenantScope): void {
    this.storage.enterWith(scope);
  }

  /** The active scope. Throws when read before authentication ran. */
  get(): TenantScope {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error('Tenant scope is not set: this route is not authenticated');
    }
    return scope;
  }

  /** Non-throwing read, for optional-auth routes. */
  peek(): TenantScope | null {
    return this.storage.getStore() ?? null;
  }

  get clinicId(): string {
    return this.get().clinicId;
  }

  get organizationId(): string {
    return this.get().organizationId;
  }

  get role(): UserRole {
    return this.get().role;
  }
}
