import { HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

/** Audience of each Python microservice (ADR 0003). */
export type ServiceAudience = 'riaya-scheduler' | 'riaya-comms';

/** Who the API is acting for. The tenant always comes from the caller's verified JWT. */
export interface ServicePrincipal {
  clinicId: string;
  /** Acting user id, or `system` for event consumers and cron jobs. */
  userId: string;
  role: string;
  scope?: 'admin';
}

export interface ServiceRequest {
  method?: 'GET' | 'POST';
  path: string;
  principal: ServicePrincipal;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Per-call timeout; defaults to the client timeout. */
  timeoutMs?: number;
}

export interface ServiceClientOptions {
  audience: ServiceAudience;
  baseUrl: string | undefined;
  secret: string | undefined;
  timeoutMs?: number;
  /** Consecutive failures before the circuit opens. */
  failureThreshold?: number;
  /** How long an open circuit refuses calls before trying again. */
  openMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export const SERVICE_TOKEN_TTL_SECONDS = 60;
export const SERVICE_TOKEN_ISSUER = 'riaya-api';

/**
 * Signs the short-lived HS256 token a Python service verifies (iss, aud, exp, clinic_id, sub,
 * role, scope). The services take the tenant only from `clinic_id`, never from the request body.
 */
export function signServiceToken(
  jwt: JwtService,
  audience: ServiceAudience,
  principal: ServicePrincipal,
): string {
  return jwt.sign(
    {
      sub: principal.userId,
      clinic_id: principal.clinicId,
      role: principal.role,
      ...(principal.scope ? { scope: principal.scope } : {}),
    },
    {
      algorithm: 'HS256',
      issuer: SERVICE_TOKEN_ISSUER,
      audience,
      expiresIn: SERVICE_TOKEN_TTL_SECONDS,
    },
  );
}

function unavailable(audience: ServiceAudience): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'SERVICE_UNAVAILABLE',
    message: `${audience} is unavailable`,
  });
}

/**
 * HTTP client for one Python microservice: signed service token, timeout, request id
 * passthrough and a small circuit breaker so a dead service costs one timeout, not one per call.
 *
 * Errors: network failures, timeouts and 5xx become `503 SERVICE_UNAVAILABLE`; a 4xx answer
 * keeps its status and `{ code, message, details? }` body so the SPA sees the same contract.
 */
export class ServiceClient {
  private readonly logger: Logger;
  private readonly jwt: JwtService | null;
  private readonly baseUrl: string | null;
  private readonly timeoutMs: number;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private failures = 0;
  private openUntil = 0;

  constructor(private readonly options: ServiceClientOptions) {
    this.logger = new Logger(`ServiceClient:${options.audience}`);
    const url = options.baseUrl?.trim();
    const secret = options.secret ?? '';
    this.baseUrl = url ? url.replace(/\/+$/, '') : null;
    if (this.baseUrl && secret.length < 32) {
      throw new Error(
        `SERVICE_JWT_SECRET must be at least 32 characters when ${options.audience} is configured`,
      );
    }
    this.jwt = this.baseUrl ? new JwtService({ secret }) : null;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** True when the service URL is configured. Callers keep their in-process path otherwise. */
  get enabled(): boolean {
    return this.baseUrl !== null;
  }

  /** True while the circuit is open after repeated failures. */
  get circuitOpen(): boolean {
    return this.now() < this.openUntil;
  }

  async request<T>(req: ServiceRequest): Promise<T> {
    if (!this.baseUrl || !this.jwt) throw unavailable(this.options.audience);
    if (this.circuitOpen) throw unavailable(this.options.audience);

    const url = new URL(this.baseUrl + req.path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const token = signServiceToken(this.jwt, this.options.audience, req.principal);
    const requestId = randomUUID();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: req.method ?? (req.body === undefined ? 'GET' : 'POST'),
        headers: {
          authorization: `Bearer ${token}`,
          'x-request-id': requestId,
          ...(req.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: AbortSignal.timeout(req.timeoutMs ?? this.timeoutMs),
      });
    } catch (error) {
      this.recordFailure(req.path, requestId, (error as Error).name);
      throw unavailable(this.options.audience);
    }

    if (response.status >= 500) {
      this.recordFailure(req.path, requestId, `HTTP ${response.status}`);
      throw unavailable(this.options.audience);
    }
    this.failures = 0;

    const text = await response.text();
    const payload: unknown = text ? safeJson(text) : null;
    if (!response.ok) {
      const body =
        payload && typeof payload === 'object'
          ? payload
          : { code: 'INTERNAL', message: `${this.options.audience} answered ${response.status}` };
      // A 401 from a service means the shared secret is wrong: an operator problem, not the
      // caller's. Report it as unavailable instead of logging the user out.
      if (response.status === 401) {
        this.logger.error(`service token rejected path=${req.path} requestId=${requestId}`);
        throw unavailable(this.options.audience);
      }
      throw new HttpException(body as Record<string, unknown>, response.status);
    }
    return payload as T;
  }

  private recordFailure(path: string, requestId: string, reason: string): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = this.now() + this.openMs;
      this.failures = 0;
    }
    this.logger.warn(
      `call failed path=${path} requestId=${requestId} reason=${reason} circuitOpen=${this.circuitOpen}`,
    );
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
