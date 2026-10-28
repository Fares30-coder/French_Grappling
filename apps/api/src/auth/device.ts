import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config';

/** "Trusted device" cookie lifetime: one year, in seconds. */
export const DEVICE_MAX_AGE_S = 365 * 24 * 60 * 60;
export const DEVICE_COOKIE_SECURE_NAME = '__Host-tatamap_device';
export const DEVICE_COOKIE_DEV_NAME = 'tatamap_device';

/**
 * Device token payload. `typ` keeps it apart from session tokens (which carry no `typ` and are
 * refused here, while this one has no `sv`/`authTime` and is refused as a session). Not strict:
 * fast-jwt adds iat/exp/iss/aud.
 */
const devicePayloadSchema = z.object({
  typ: z.literal('device'),
  sub: z.uuid(),
  email: z.string().min(1),
});
export type DeviceClaims = z.infer<typeof devicePayloadSchema>;

export const deviceCookieName = (config: Pick<AppConfig, 'cookieSecure'>): string =>
  config.cookieSecure ? DEVICE_COOKIE_SECURE_NAME : DEVICE_COOKIE_DEV_NAME;

/** Sets the trusted-device cookie, bound to the admin id and (normalised) email. */
export function issueDevice(
  app: FastifyInstance,
  reply: FastifyReply,
  config: AppConfig,
  admin: { id: string; email: string },
): void {
  const token = app.jwt.sign(
    { typ: 'device', sub: admin.id, email: admin.email.toLowerCase() },
    { expiresIn: '365d' },
  );
  reply.setCookie(deviceCookieName(config), token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    maxAge: DEVICE_MAX_AGE_S,
  });
}

/**
 * Claims of a valid device cookie, or null. It only ever relaxes the per-account lockout at login;
 * it never authenticates a request.
 */
export function readDevice(
  app: FastifyInstance,
  request: FastifyRequest,
  config: AppConfig,
): DeviceClaims | null {
  const token = request.cookies[deviceCookieName(config)];
  if (!token) return null;
  try {
    const parsed = devicePayloadSchema.safeParse(app.jwt.verify(token));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
