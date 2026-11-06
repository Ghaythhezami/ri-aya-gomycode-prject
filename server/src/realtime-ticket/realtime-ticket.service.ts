import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { RealtimeTicket } from '@riaya/shared';
import { SERVICE_TOKEN_ISSUER } from '../services/service-client';

export const REALTIME_TICKET_AUDIENCE = 'riaya-realtime';
export const REALTIME_TICKET_TTL_SECONDS = 60;
export const REALTIME_SOCKET_PATH = '/socket.io';
const MIN_SECRET_LENGTH = 32;

export interface TicketPrincipal {
  userId: string;
  clinicId: string;
  role: string;
}

/**
 * Issues the one-time ticket the browser presents when opening the Socket.IO connection on
 * riaya-comms (ADR 0004 section 4). The comms service verifies it and consumes its `jti` once.
 * When realtime is not configured the ticket is null and the SPA keeps polling.
 */
@Injectable()
export class RealtimeTicketService {
  constructor(private readonly config: ConfigService) {}

  issue(principal: TicketPrincipal, now: number = Date.now()): RealtimeTicket {
    const url = this.config.get<string>('REALTIME_PUBLIC_URL')?.trim() || null;
    const secret = this.config.get<string>('SERVICE_JWT_SECRET') ?? '';
    if (!url || secret.length < MIN_SECRET_LENGTH) {
      return { url: null, path: REALTIME_SOCKET_PATH, ticket: null, expiresAt: null };
    }
    const ticket = new JwtService({ secret }).sign(
      {
        sub: principal.userId,
        clinic_id: principal.clinicId,
        role: principal.role,
        jti: randomUUID(),
        iat: Math.floor(now / 1000),
      },
      {
        algorithm: 'HS256',
        issuer: SERVICE_TOKEN_ISSUER,
        audience: REALTIME_TICKET_AUDIENCE,
        expiresIn: REALTIME_TICKET_TTL_SECONDS,
      },
    );
    return {
      url: url.replace(/\/+$/, ''),
      path: REALTIME_SOCKET_PATH,
      ticket,
      expiresAt: new Date(now + REALTIME_TICKET_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
