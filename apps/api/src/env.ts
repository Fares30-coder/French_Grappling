import { z } from 'zod';
import type { AppConfig } from './config';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JWT_SECRET: z
      .string()
      .refine((s) => Buffer.byteLength(s, 'utf8') >= 32, 'JWT_SECRET must be at least 32 bytes'),
    WEB_ORIGINS: z
      .string()
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(
            z
              .url()
              // mailto:, ftp:, javascript:... are valid URLs but never valid web origins.
              .refine(
                (u) => URL.canParse(u) && ['http:', 'https:'].includes(new URL(u).protocol),
                'WEB_ORIGINS entries must be http: or https: URLs',
              )
              .transform((u) => new URL(u).origin),
          )
          .min(1),
      ),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.COOKIE_SECURE, {
    message: 'COOKIE_SECURE=false is forbidden in production',
    path: ['COOKIE_SECURE'],
  })
  .refine(
    (e) => e.NODE_ENV !== 'production' || e.WEB_ORIGINS.every((o) => o.startsWith('https:')),
    {
      message: 'WEB_ORIGINS must be https: URLs in production',
      path: ['WEB_ORIGINS'],
    },
  );
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

export const SECURE_COOKIE_NAME = '__Host-tatamap_session';
export const DEV_COOKIE_NAME = 'tatamap_session';

/** The only part of the environment `buildApp` sees (it never reads process.env itself). */
export function toAppConfig(env: Env): AppConfig {
  return {
    jwtSecret: env.JWT_SECRET,
    webOrigins: env.WEB_ORIGINS,
    cookieSecure: env.COOKIE_SECURE,
    // The __Host- prefix requires Secure; without Secure (Safari on http://localhost) use a plain name.
    cookieName: env.COOKIE_SECURE ? SECURE_COOKIE_NAME : DEV_COOKIE_NAME,
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
  };
}
