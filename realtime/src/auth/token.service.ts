import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { accessTokenClaimsSchema } from './claims';

/**
 * The only reason a connection is ever refused. Callers must not distinguish
 * expiry from a bad signature (AC-002): telling an attacker which half of the
 * credential failed is free help.
 */
export const UNAUTHORIZED_REASON = 'UNAUTHORIZED';

export interface ConnectionScope {
  userId: string;
  clinicId: string;
  role: string;
  email?: string;
  /** Epoch milliseconds at which the access token stops being valid. */
  expiresAt: number;
}

export class ConnectionRefusedError extends Error {
  constructor() {
    super(UNAUTHORIZED_REASON);
    this.name = 'ConnectionRefusedError';
  }
}

/** The maximum length a handshake token may occupy before it is refused unread. */
const MAX_TOKEN_LENGTH = 4096;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly jwt: JwtService) {}

  /**
   * Verify an access token and return the scope it grants (FR-003, T3.2).
   *
   * Throws {@link ConnectionRefusedError} for every failure mode. Only the
   * error's class is logged - never the token, and never the signature detail.
   */
  async verify(raw: unknown): Promise<ConnectionScope> {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_TOKEN_LENGTH) {
      this.logger.warn('handshake refused: no usable credential supplied');
      throw new ConnectionRefusedError();
    }

    let payload: unknown;

    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(raw, {
        algorithms: ['HS256'],
      });
    } catch (error) {
      this.logger.warn(
        `handshake refused: ${error instanceof Error ? error.name : 'invalid token'}`,
      );
      throw new ConnectionRefusedError();
    }

    const parsed = accessTokenClaimsSchema.safeParse(payload);

    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.join('.') || '(root)';
      this.logger.warn(`handshake refused: token claims invalid at ${field}`);
      throw new ConnectionRefusedError();
    }

    const claims = parsed.data;

    return {
      userId: claims.sub,
      clinicId: claims.clinic_id,
      role: claims.role,
      email: claims.email,
      expiresAt: claims.exp * 1000,
    };
  }
}
