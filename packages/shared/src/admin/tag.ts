import { z } from 'zod';
import { slugSchema } from '../common';
import { idSchema, labelInputSchema } from './common';

/** POST /api/admin/tags. */
export const tagInputSchema = z.strictObject({ slug: slugSchema, name: labelInputSchema });
export type TagInput = z.infer<typeof tagInputSchema>;

export const adminTagSchema = tagInputSchema.extend({ id: idSchema });
export type AdminTag = z.infer<typeof adminTagSchema>;
export const adminTagListSchema = z.array(adminTagSchema);
