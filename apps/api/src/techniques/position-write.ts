import type { PositionInput, TagInput } from '@tatamap/shared';
import type { Prisma } from '../generated/prisma/client';

/** Explicit field mapping: nothing from the request body reaches Prisma except these fields. */
export const toPositionData = (input: PositionInput): Prisma.PositionCreateInput => ({
  slug: input.slug,
  name: input.name,
  description: input.description,
  role: input.role,
});

export const toTagData = (input: TagInput): Prisma.TagCreateInput => ({
  slug: input.slug,
  name: input.name,
});
