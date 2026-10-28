import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid slug');

export const API_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'rate_limited',
  'internal',
] as const;
/** Optional machine-readable detail next to `code`, so the front can show a precise message. */
export const API_ERROR_REASONS = [
  'version_mismatch', // 409: someone saved in between (other tab)
  'slug_taken', // 409
  'slug_locked', // 409: slug change on a published technique
  'still_published', // 409: delete of a published technique
  'not_publishable', // 409: publish, or PUT of a published technique, with publishIssues()
  'unknown_reference', // 400: position / tag / chain target does not exist
  'self_chain', // 400
] as const;
export type ApiErrorReason = (typeof API_ERROR_REASONS)[number];

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    reason: z.enum(API_ERROR_REASONS).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const APP_NAME = 'Tatamap';
