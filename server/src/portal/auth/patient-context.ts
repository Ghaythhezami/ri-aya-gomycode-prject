import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** The verified patient behind a portal request (ADR 0005 section 1). */
export interface PortalPrincipal {
  accountId: string;
  patientId: string;
  clinicId: string;
  locale: 'en' | 'fr' | 'ar';
}

interface PatientFrame {
  principal: PortalPrincipal | null;
}

/**
 * Request-scoped holder of the portal principal, populated ONLY by `PortalJwtGuard` from the
 * verified token. Same frame pattern as `TenantContext`: the middleware opens one mutable frame
 * per request, the guard fills it. Every portal query is scoped by `clinicId` and `patientId`
 * read from here, never from a body, query or header.
 */
@Injectable()
export class PatientContext {
  private readonly storage = new AsyncLocalStorage<PatientFrame>();

  runWithFrame(next: () => void): void {
    this.storage.run({ principal: null }, next);
  }

  set(principal: PortalPrincipal): void {
    const frame = this.storage.getStore();
    if (frame) {
      frame.principal = principal;
      return;
    }
    // No frame (a service called outside an HTTP request, e.g. a unit test).
    this.storage.enterWith({ principal });
  }

  /** The active principal. Throws when read on a route without `PortalJwtGuard`. */
  get(): PortalPrincipal {
    const principal = this.storage.getStore()?.principal;
    if (!principal) throw new Error('Patient context is not set: this route is not authenticated');
    return principal;
  }

  /** Non-throwing read. */
  peek(): PortalPrincipal | null {
    return this.storage.getStore()?.principal ?? null;
  }
}

@Injectable()
export class PatientContextMiddleware implements NestMiddleware {
  constructor(private readonly patient: PatientContext) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.patient.runWithFrame(next);
  }
}
