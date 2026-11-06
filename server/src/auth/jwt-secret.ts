import type { ConfigService } from '@nestjs/config';

/** The only signing algorithm the API issues or accepts (rejects `none` and RS/HS confusion). */
export const JWT_ALGORITHM = 'HS256' as const;

const DEV_FALLBACK = 'dev-access-secret-change-me-32chars';

/**
 * The access-token secret. The development fallback is refused in production
 * so a missing env var fails the cold start instead of signing with a public key.
 */
export function resolveJwtSecret(config: Pick<ConfigService, 'get'>): string {
  const secret = config.get<string>('JWT_ACCESS_SECRET');
  const production = config.get<string>('NODE_ENV') === 'production' || !!process.env.VERCEL;
  if (production && (!secret || secret === DEV_FALLBACK || secret.length < 32)) {
    throw new Error('JWT_ACCESS_SECRET must be set to a random value of at least 32 characters');
  }
  return secret ?? DEV_FALLBACK;
}
