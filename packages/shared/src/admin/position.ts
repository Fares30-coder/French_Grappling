import { z } from 'zod';
import { slugSchema } from '../common';
import { positionRoleSchema } from '../enums';
import { idSchema, labelInputSchema } from './common';

/** POST / PUT /api/admin/positions. */
export const positionInputSchema = z.strictObject({
  slug: slugSchema,
  name: labelInputSchema,
  description: z.string().trim().max(1000),
  role: positionRoleSchema,
});
export type PositionInput = z.infer<typeof positionInputSchema>;

export const adminPositionSchema = positionInputSchema.extend({ id: idSchema });
export type AdminPosition = z.infer<typeof adminPositionSchema>;
export const adminPositionListSchema = z.array(adminPositionSchema);
