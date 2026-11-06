/**
 * Structured logging configuration (BP-003, FR-001, FR-003, FR-004).
 *
 * Everything that decides *what* a log record looks like lives here, so the
 * module that wires it into Nest stays a thin wrapper and the redact list is a
 * single constant a reviewer can read in the diff (CON-519, RISK-002).
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

/** Header that carries the correlation id in and out of the API (FR-002). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Value written in place of a redacted field. */
export const REDACT_CENSOR = '[REDACTED]';

/**
 * The levels pino accepts, plus `silent`.
 *
 * `LOG_LEVEL` is the only knob the operator gets (NFR-004, T3.1); anything
 * outside this list is a typo, not a level.
 */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Level used when `LOG_LEVEL` is unset or unusable (FR-004, EC-001). */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Keys whose value must never reach the sink, at any depth (FR-003, AC-003).
 *
 * `passwordHash` and `token` are here because the auth module logs user objects
 * and invitation records; `authorization` and `cookie` because pino-http
 * serialises request headers by default.
 */
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  // Personal data (NFR): patient and staff identifiers must never reach a log sink.
  'phone',
  'email',
  'dateOfBirth',
  'clinicalNotes',
  'adminNotes',
  'address',
] as const;

/**
 * How many levels deep a sensitive key is still redacted.
 *
 * pino's `*` matches exactly one path segment, so "at any depth" has to be
 * spelled out as one path per depth. Four covers `req.body.user.password` and
 * the nested shapes this API actually produces; the explicit header paths below
 * cover the one place pino-http always writes them.
 */
const REDACT_DEPTH = 4;

/** `password`, `*.password`, `*.*.password`, ... up to {@link REDACT_DEPTH}. */
function redactPathsFor(key: string): string[] {
  const paths = [key];

  for (let depth = 1; depth <= REDACT_DEPTH; depth += 1) {
    paths.push(`${new Array<string>(depth).fill('*').join('.')}.${key}`);
  }

  return paths;
}

/**
 * The redact list, as one constant (FR-003, CON-519).
 *
 * Add a key to {@link SENSITIVE_KEYS} rather than appending a path here, so the
 * depth expansion stays consistent for every entry.
 */
export const REDACT_PATHS: string[] = [
  // pino-http serialises these two on every request record.
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body',
  'req.query',
  'res.body',
  // The response header is an array, so it is addressed with bracket syntax.
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap(redactPathsFor),
];

/**
 * The request path without its query string. Search terms (`?search=Jane%20Doe`,
 * `?phone=...`) are personal data, so they are never written to a log record.
 */
export function pathOnly(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/** Result of reading `LOG_LEVEL`, including the warning EC-001 asks for. */
export interface LogLevelResolution {
  level: LogLevel;
  /** Set only when `LOG_LEVEL` held an unusable value. */
  warning?: string;
}

/**
 * Resolve `LOG_LEVEL` to a level pino accepts (FR-004, EC-001).
 *
 * An unknown value falls back to `info` and reports a warning naming the bad
 * input; it never throws, because a typo in an env var must not stop the API
 * from booting.
 */
export function resolveLogLevel(raw?: string | null): LogLevelResolution {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return { level: DEFAULT_LOG_LEVEL };
  }

  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return { level: value as LogLevel };
  }

  return {
    level: DEFAULT_LOG_LEVEL,
    warning: `LOG_LEVEL="${raw}" is not a recognised level (${LOG_LEVELS.join(', ')}); falling back to "${DEFAULT_LOG_LEVEL}".`,
  };
}

/**
 * A client-supplied correlation id is echoed and logged, so it is treated as
 * untrusted input: bounded length, safe token only (EC-002, CON-515).
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** True when `value` may be echoed into a header and written to the log. */
export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

/**
 * Assign the request id, or generate one when the client's is unusable
 * (FR-002, EC-002).
 *
 * The id is written back as `X-Request-Id` so a caller can quote it, and it is
 * the same value every record for this request carries.
 */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const supplied = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
  const reqId = isSafeRequestId(candidate) ? candidate : randomUUID();

  res.setHeader('X-Request-Id', reqId);

  return reqId;
}

/**
 * Environment variable that redirects the sink to a file (tests only).
 *
 * `nestjs-pino` builds pino-http itself, so a `destination` option would be
 * ignored; pino's `transport` is the supported way to change the sink. Unset in
 * every runtime path, which is what keeps production writing to stdout.
 */
export const LOG_TRANSPORT_TARGET = 'LOG_TRANSPORT_TARGET';

/** pino `transport` that appends records to {@link LOG_TRANSPORT_TARGET}. */
export interface LogTransport {
  targets: { target: string; options: { destination: string } }[];
}

/**
 * The pino transport to use, or `undefined` to keep the default stdout sink.
 *
 * Referenced by absolute path because the transport runs in a pino worker
 * thread, so it cannot receive a function reference from this module. pino
 * resolves a relative target against its own caller stack, not against this
 * file, so the path has to be resolved here.
 */
export function resolveTransport(target?: string | null): LogTransport | undefined {
  const destination = target?.trim();

  if (!destination) {
    return undefined;
  }

  return {
    targets: [{ target: join(__dirname, 'app-log-stream.ts'), options: { destination } }],
  };
}

/**
 * Map the response status to a severity (FR-004, AC-004).
 *
 * A thrown error counts as a failure even when the status is not yet written,
 * so an exception that the filter later turns into a 500 is not logged at
 * `info`.
 */
export function customLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): 'error' | 'warn' | 'info' {
  if (err || res.statusCode >= 500) {
    return 'error';
  }

  if (res.statusCode >= 400) {
    return 'warn';
  }

  return 'info';
}
