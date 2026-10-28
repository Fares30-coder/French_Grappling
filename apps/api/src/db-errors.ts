/** Prisma error code for a unique constraint violation (e.g. a taken slug). */
const UNIQUE_VIOLATION = 'P2002';
/** Prisma error code for a foreign key violation (a referenced row vanished: race with a delete). */
const FOREIGN_KEY_VIOLATION = 'P2003';
/** Prisma error code for "record to update not found". */
const RECORD_NOT_FOUND = 'P2025';

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code) // narrowed by the checks above
    : undefined;

export const isUniqueViolation = (error: unknown): boolean => codeOf(error) === UNIQUE_VIOLATION;
export const isRecordNotFound = (error: unknown): boolean => codeOf(error) === RECORD_NOT_FOUND;
export const isForeignKeyViolation = (error: unknown): boolean =>
  codeOf(error) === FOREIGN_KEY_VIOLATION;
