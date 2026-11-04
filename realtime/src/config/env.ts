/**
 * Environment configuration (FR-001, NFR-008, NFR-017).
 *
 * Read once at boot and validated as a whole, so a missing variable fails with
 * every problem named at once instead of crashing the first consumer. Nothing
 * here ever logs a value: messages name the variable and the rule it broke.
 */
import { z } from 'zod';

/** DI token for the resolved environment. */
export const ENV = 'REALTIME_ENV';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REALTIME_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters and is never committed'),
  REDIS_URL: z.url('must be a redis:// URL'),
  MONGO_URI: z.string().min(1, 'is required'),
  REALTIME_CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5174'),
  LOG_LEVEL: z.string().optional(),
});

export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  jwtAccessSecret: string;
  redisUrl: string;
  mongoUri: string;
  corsOrigins: string[];
  logLevel?: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid realtime environment: ${detail}`);
  }

  const value = parsed.data;

  return {
    nodeEnv: value.NODE_ENV,
    port: value.REALTIME_PORT,
    jwtAccessSecret: value.JWT_ACCESS_SECRET,
    redisUrl: value.REDIS_URL,
    mongoUri: value.MONGO_URI,
    corsOrigins: value.REALTIME_CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: value.LOG_LEVEL,
  };
}
