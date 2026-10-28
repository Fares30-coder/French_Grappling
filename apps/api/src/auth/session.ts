import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config';

/** Session lifetime, in seconds (JWT `exp` and cookie `Max-Age`). */
export const SESSION_MAX_AGE_S = 2 * 60 * 60;
/** Sliding renewal: a request made with less than this left re-issues the cookie. */
export const RENEW_BELOW_S = 60 * 60;

/** Payload re-parsed after signature check. Not strict: fast-jwt adds iss/aud. */
export const sessionPayloadSchema = z.object({ sub: z.uuid(), iat: z.int(), exp: z.int() });
export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

const cookieOptions = (config: AppConfig) =>
  ({
    path: '/', // required by the __Host- prefix
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
  }) as const;

/** Signs a session token for `adminId` and sets it as the session cookie. */
export function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  config: AppConfig,
  adminId: string,
): void {
  const token = app.jwt.sign({ sub: adminId });
  reply.setCookie(config.cookieName, token, {
    ...cookieOptions(config),
    maxAge: SESSION_MAX_AGE_S,
  });
}

export function clearSession(reply: FastifyReply, config: AppConfig): void {
  reply.setCookie(config.cookieName, '', {
    ...cookieOptions(config),
    maxAge: 0,
    expires: new Date(0),
  });
}

/** True when the token should be re-issued (less than RENEW_BELOW_S left). */
export const shouldRenew = (exp: number, nowSeconds: number): boolean =>
  exp - nowSeconds < RENEW_BELOW_S;
