/**
 * Structured logging configuration (NFR-006, NFR-017).
 *
 * A copy of `server`'s conventions rather than an import: CON-106 forbids the
 * cross-app import, and this is the smallest faithful reproduction of the
 * record shape that keeps one log pipeline reading both processes.
 */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export const REDACT_CENSOR = '[REDACTED]';

/**
 * Keys never written to the sink (T7.5).
 *
 * `token`, `accessToken` and `authorization` cover the handshake credential;
 * `clinicId` is redacted because the plan records the tenant claim as
 * sensitive context for this service, which stores no patient data at all.
 */
const SENSITIVE_KEYS = ['token', 'accessToken', 'authorization', 'cookie', 'clinicId'] as const;

const REDACT_DEPTH = 3;

function redactPathsFor(key: string): string[] {
  const paths = [key];

  for (let depth = 1; depth <= REDACT_DEPTH; depth += 1) {
    paths.push(`${new Array<string>(depth).fill('*').join('.')}.${key}`);
  }

  return paths;
}

export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap(redactPathsFor),
];

/** Resolve `LOG_LEVEL`, falling back to `info` on an unusable value. */
export function resolveLogLevel(raw?: string | null): LogLevel {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return DEFAULT_LOG_LEVEL;
  }

  return (LOG_LEVELS as readonly string[]).includes(value)
    ? (value as LogLevel)
    : DEFAULT_LOG_LEVEL;
}
