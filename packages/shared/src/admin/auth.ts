import { z } from 'zod';

export const loginInputSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(256), // max bounds the argon2 work per request
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const adminSessionSchema = z.strictObject({ email: z.email() });
export type AdminSession = z.infer<typeof adminSessionSchema>;

/** Enforced by the create-admin script only (login accepts anything non-empty up to the max). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 256;
