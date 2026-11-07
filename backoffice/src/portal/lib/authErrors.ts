import { portalErrorCode, portalErrorStatus } from './session';

export type AuthErrorKind =
  | 'locked'
  | 'invalid'
  | 'exists'
  | 'rate'
  | 'forbidden'
  | 'disabled'
  | 'validation'
  | 'invite'
  | 'offline'
  | 'generic';

/** Maps a portal auth failure to one of the localised messages under `portal.authErrors`. */
export function authErrorKind(error: unknown): AuthErrorKind {
  const code = portalErrorCode(error);
  const status = portalErrorStatus(error);
  if (code === 'ACCOUNT_LOCKED' || code === 'ACCOUNT_LOCKED_OUT') return 'locked';
  if (code === 'PORTAL_DISABLED') return 'disabled';
  if (status === 403) return 'forbidden';
  if (code === 'INVALID_CREDENTIALS') return 'invalid';
  if (code === 'ACCOUNT_EXISTS') return 'exists';
  if (code === 'RATE_LIMITED' || status === 429) return 'rate';
  if (code === 'VALIDATION_FAILED' || code === 'WEAK_PASSWORD') return 'validation';
  if (
    code === 'INVALID_INVITE' ||
    code === 'INVITE_EXPIRED' ||
    code === 'INVALID_TOKEN' ||
    code === 'INVITE_INVALID'
  ) {
    return 'invite';
  }
  if (status === undefined) return 'offline';
  return 'generic';
}

/** Minutes to wait after a lockout, from `retryAfterSeconds` (top level or in `details`). */
export function lockoutMinutes(error: unknown): number | null {
  const data = (
    error as { response?: { data?: { retryAfterSeconds?: unknown; details?: unknown } } }
  )?.response?.data;
  const fromDetails = (data?.details as { retryAfterSeconds?: unknown } | undefined)
    ?.retryAfterSeconds;
  const seconds = Number(data?.retryAfterSeconds ?? fromDetails);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null;
}
