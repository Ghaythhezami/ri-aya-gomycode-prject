/**
 * Unit tests for the logging configuration (BP-003).
 *
 * These cover the decisions that live in `logging.config.ts` and therefore need
 * no running application: the level resolver (AC-004, EC-001), the trusted
 * request-id gate (AC-002, EC-002) and the status-to-severity map (AC-004).
 * The record shape itself is asserted end to end in `logging.module.spec.ts`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  customLogLevel,
  DEFAULT_LOG_LEVEL,
  genReqId,
  isSafeRequestId,
  LOG_LEVELS,
  REDACT_CENSOR,
  REDACT_PATHS,
  REQUEST_ID_HEADER,
  resolveLogLevel,
} from './logging.config';

function fakeResponse(): ServerResponse & { headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};

  return {
    headers,
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse & { headers: Record<string, unknown> };
}

function fakeRequest(headers: Record<string, unknown> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('logging configuration', () => {
  describe('resolveLogLevel (AC-004)', () => {
    it('AC-004: honours each level it documents', () => {
      for (const level of LOG_LEVELS) {
        expect(resolveLogLevel(level)).toEqual({ level });
      }
    });

    it('AC-004: defaults to info when LOG_LEVEL is unset', () => {
      expect(resolveLogLevel(undefined)).toEqual({ level: 'info' });
      expect(resolveLogLevel('')).toEqual({ level: 'info' });
      expect(resolveLogLevel('   ')).toEqual({ level: 'info' });
      expect(DEFAULT_LOG_LEVEL).toBe('info');
    });

    it('AC-004: accepts a level regardless of case and surrounding space', () => {
      expect(resolveLogLevel('  DEBUG ')).toEqual({ level: 'debug' });
    });

    it('AC-004: falls back to info and names the bad input rather than throwing', () => {
      const resolved = resolveLogLevel('verbose');

      expect(resolved.level).toBe('info');
      expect(resolved.warning).toContain('verbose');
    });
  });

  describe('isSafeRequestId (AC-002, EC-002)', () => {
    it('AC-002: accepts the token shapes a client may send', () => {
      expect(isSafeRequestId('safe-id-123')).toBe(true);
      expect(isSafeRequestId('A_b-9')).toBe(true);
      expect(isSafeRequestId('a'.repeat(128))).toBe(true);
    });

    it('AC-002: rejects everything that is not a bounded safe token', () => {
      expect(isSafeRequestId('a'.repeat(129))).toBe(false);
      expect(isSafeRequestId('')).toBe(false);
      expect(isSafeRequestId('has space')).toBe(false);
      expect(isSafeRequestId('inject\nnewline')).toBe(false);
      expect(isSafeRequestId('semi;colon')).toBe(false);
      expect(isSafeRequestId('quote"inside')).toBe(false);
      expect(isSafeRequestId(undefined)).toBe(false);
      expect(isSafeRequestId(42)).toBe(false);
    });
  });

  describe('genReqId (AC-002)', () => {
    it('AC-002: echoes a safe client id into the response header', () => {
      const res = fakeResponse();
      const id = genReqId(fakeRequest({ [REQUEST_ID_HEADER]: 'safe-id-123' }), res);

      expect(id).toBe('safe-id-123');
      expect(res.headers[REQUEST_ID_HEADER]).toBe('safe-id-123');
    });

    it('AC-002: replaces an unusable client id with a generated one', () => {
      const res = fakeResponse();
      const id = genReqId(fakeRequest({ [REQUEST_ID_HEADER]: 'not safe!' }), res);

      expect(id).not.toBe('not safe!');
      expect(isSafeRequestId(id)).toBe(true);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(id);
    });

    it('AC-002: generates an id when the client sends none', () => {
      const first = fakeResponse();
      const second = fakeResponse();

      const a = genReqId(fakeRequest(), first);
      const b = genReqId(fakeRequest(), second);

      expect(isSafeRequestId(a)).toBe(true);
      expect(isSafeRequestId(b)).toBe(true);
      expect(a).not.toBe(b);
      expect(first.headers[REQUEST_ID_HEADER]).toBe(a);
    });
  });

  describe('customLogLevel (AC-004)', () => {
    it('AC-004: logs 5xx at error and 4xx at warn', () => {
      expect(customLogLevel(fakeRequest(), { statusCode: 500 } as ServerResponse)).toBe('error');
      expect(customLogLevel(fakeRequest(), { statusCode: 503 } as ServerResponse)).toBe('error');
      expect(customLogLevel(fakeRequest(), { statusCode: 400 } as ServerResponse)).toBe('warn');
      expect(customLogLevel(fakeRequest(), { statusCode: 404 } as ServerResponse)).toBe('warn');
    });

    it('AC-004: logs everything else at info', () => {
      expect(customLogLevel(fakeRequest(), { statusCode: 200 } as ServerResponse)).toBe('info');
      expect(customLogLevel(fakeRequest(), { statusCode: 201 } as ServerResponse)).toBe('info');
      expect(customLogLevel(fakeRequest(), { statusCode: 304 } as ServerResponse)).toBe('info');
    });

    it('AC-004: treats a thrown error as a failure even before the status is written', () => {
      expect(
        customLogLevel(fakeRequest(), { statusCode: 200 } as ServerResponse, new Error('boom')),
      ).toBe('error');
    });
  });

  describe('redact list (AC-003)', () => {
    it('AC-003: redacts the request headers pino-http serialises by default', () => {
      expect(REDACT_PATHS).toEqual(
        expect.arrayContaining([
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ]),
      );
    });

    it('AC-003: covers credential keys at the top level and at depth', () => {
      for (const key of ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken']) {
        expect(REDACT_PATHS).toEqual(
          expect.arrayContaining([key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`]),
        );
      }
    });

    it('AC-003: uses a placeholder, not a dropped key', () => {
      expect(REDACT_CENSOR).toBe('[REDACTED]');
    });
  });
});
