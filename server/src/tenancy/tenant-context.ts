import { Injectable, Scope } from '@nestjs/common';
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
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private scope: TenantScope | null = null;

  set(scope: TenantScope): void {
    this.scope = scope;
  }

  /** The active scope. Throws when read before authentication ran. */
  get(): TenantScope {
    if (!this.scope) {
      throw new Error('Tenant scope is not set: this route is not authenticated');
    }
    return this.scope;
  }

  /** Non-throwing read, for optional-auth routes. */
  peek(): TenantScope | null {
    return this.scope;
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
