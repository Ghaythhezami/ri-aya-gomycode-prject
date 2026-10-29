import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

/**
 * Opens one `AsyncLocalStorage` frame per HTTP request, before Nest runs any
 * guard or controller (D15).
 *
 * Registering this as middleware — rather than relying on `enterWith()` inside
 * `JwtStrategy.validate` — is what makes the scope visible to controllers: the
 * frame is created once for the whole request and later mutated, so it does not
 * matter which async context the passport strategy happens to run in.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenant: TenantContext) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenant.runWithFrame(next);
  }
}
