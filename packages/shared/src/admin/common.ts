import { z } from 'zod';

export const idSchema = z.uuid();
export const idParamsSchema = z.strictObject({ id: idSchema });
export const versionInputSchema = z.strictObject({ version: z.int().min(1) });

/** Trimmed variants for inputs typed by a human. */
export const labelInputSchema = z.string().trim().min(1).max(120);
export const listItemInputSchema = z.string().trim().min(1).max(300);

export const hasNoDuplicates = <T>(items: ReadonlyArray<T>, key: (item: T) => string): boolean =>
  new Set(items.map(key)).size === items.length;
