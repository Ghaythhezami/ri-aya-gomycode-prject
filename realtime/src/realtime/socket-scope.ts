/**
 * Room naming and handshake extraction (FR-004, FR-005).
 *
 * Room names are built from token values only, so a forged name is not
 * representable rather than filtered: a client cannot produce `clinic:<other>`
 * without an `<other>` that the server itself derived.
 */
export const userRoom = (userId: string): string => `user:${userId}`;

export const clinicRoom = (clinicId: string): string => `clinic:${clinicId}`;

/** The one header a bearer token may arrive in. */
const AUTHORIZATION_HEADER = 'authorization';

/**
 * Read the access token from the handshake `auth` payload, falling back to an
 * `Authorization: Bearer` header (T3.1, FR-003).
 *
 * Both are untrusted input: only a bounded string is returned, and nothing here
 * parses or decodes the credential.
 */
export function extractToken(handshake: {
  auth?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const auth = handshake.auth;

  if (auth && typeof auth === 'object') {
    const token = (auth as { token?: unknown }).token;

    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
  }

  const header = handshake.headers?.[AUTHORIZATION_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value === 'string' && value.toLowerCase().startsWith('bearer ')) {
    return value.slice('bearer '.length).trim();
  }

  return undefined;
}
