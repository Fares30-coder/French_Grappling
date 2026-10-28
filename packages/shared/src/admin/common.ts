import { z } from 'zod';

/** Trimmed variants for inputs typed by a human. */
export const labelInputSchema = z.string().trim().min(1).max(120);
export const listItemInputSchema = z.string().trim().min(1).max(300);
