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
 * One mutable frame per HTTP request.
 *
 * The frame object is created once by the middleware and then MUTATED when the
 * token is verified. That is deliberate: installing a store with `enterWith()`
 * from inside the passport strategy does not survive into the controller's async
 * context, so `get()` threw "Tenant scope is not set" for every endpoint that
 * reads it (D15). Mutating a frame that the whole request already shares works
 * regardless of where the async boundary falls.
 */
interface TenantFrame {
  scope: TenantScope | null;
}

/**
 * Request-scoped holder for the active tenant.
 *
 * Populated ONLY from the verified JWT (FR-004). Nothing in a request body or
 * query string may widen or change this scope — that is the whole point of
 * AC-025: a caller who supplies a different `clinic_id` is ignored, not obeyed.
 *
 * The provider itself stays a singleton (no Nest `Scope.REQUEST`), because a
 * request-scoped provider bubbles its scope into every consumer and made
 * `JwtStrategy` request-scoped; Nest then never constructed it at bootstrap and
 * every guarded route failed with `Unknown authentication strategy "jwt"` (D8).
 */
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantFrame>();

  /**
   * Opens the request frame. Registered as middleware so the whole request —
   * middleware, guards, passport strategy, controller — runs inside one frame.
   */
  runWithFrame(next: () => void): void {
    this.storage.run({ scope: null }, next);
  }

  set(scope: TenantScope): void {
    const frame = this.storage.getStore();
    if (frame) {
      frame.scope = scope;
      return;
    }
    // No frame (a service invoked outside an HTTP request, e.g. a seed or unit
    // test): bind the current execution context so callers still see the scope.
    this.storage.enterWith({ scope });
  }

  /** The active scope. Throws when read before authentication ran. */
  get(): TenantScope {
    const scope = this.storage.getStore()?.scope;
    if (!scope) {
      throw new Error('Tenant scope is not set: this route is not authenticated');
    }
    return scope;
  }

  /** Non-throwing read, for optional-auth routes. */
  peek(): TenantScope | null {
    return this.storage.getStore()?.scope ?? null;
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
