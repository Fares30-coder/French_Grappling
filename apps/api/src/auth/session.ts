import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config';
import type { PrismaClient } from '../generated/prisma/client';

/** Session lifetime, in seconds (JWT `exp` and cookie `Max-Age`). */
export const SESSION_MAX_AGE_S = 2 * 60 * 60;
/** Sliding renewal: a request made with less than this left re-issues the cookie. */
export const RENEW_BELOW_S = 60 * 60;
/** Absolute lifetime since the initial login: sliding renewal never extends beyond it. */
export const ABSOLUTE_SESSION_MAX_AGE_S = 12 * 60 * 60;

/**
 * Payload re-parsed after signature check. Not strict: fast-jwt adds iss/aud.
 * `sv` is the admin's `sessionVersion` at signing time; `authTime` is the initial login time
 * (epoch seconds), kept unchanged when the token is renewed.
 */
export const sessionPayloadSchema = z.object({
  sub: z.uuid(),
  sv: z.int().min(0),
  authTime: z.int(),
  iat: z.int(),
  exp: z.int(),
});
export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

const cookieOptions = (config: AppConfig) =>
  ({
    path: '/', // required by the __Host- prefix
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
  }) as const;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Signs a session token and sets it as the session cookie. `authTime` is the initial login time:
 * omit it for a fresh login, pass the existing one when renewing.
 */
export function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  config: AppConfig,
  admin: { id: string; sessionVersion: number },
  authTime: number = nowSeconds(),
): void {
  const token = app.jwt.sign({ sub: admin.id, sv: admin.sessionVersion, authTime });
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
export const shouldRenew = (exp: number, now: number): boolean => exp - now < RENEW_BELOW_S;

export type AuthenticatedSession = {
  admin: { id: string; email: string; sessionVersion: number };
  payload: SessionPayload;
};

/**
 * Verifies the session cookie (never the Authorization header), the payload shape, the absolute
 * lifetime and the revocation counter. Returns null for any failure.
 */
export async function authenticate(
  request: FastifyRequest,
  prisma: PrismaClient,
): Promise<AuthenticatedSession | null> {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    return null;
  }
  const parsed = sessionPayloadSchema.safeParse(request.user);
  if (!parsed.success) return null;
  const payload = parsed.data;
  if (nowSeconds() - payload.authTime > ABSOLUTE_SESSION_MAX_AGE_S) return null;

  // Deleting the admin revokes the session immediately.
  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin || admin.sessionVersion !== payload.sv) return null;
  return {
    admin: { id: admin.id, email: admin.email, sessionVersion: admin.sessionVersion },
    payload,
  };
}
