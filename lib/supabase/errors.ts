import type { PostgrestError } from '@supabase/supabase-js';

// Postgres SQLSTATE for a unique-constraint violation.
const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === PG_UNIQUE_VIOLATION;
}

// Postgres SQLSTATE for a foreign-key violation — e.g. the row it points at was deleted meanwhile.
const PG_FOREIGN_KEY_VIOLATION = '23503';

export function isForeignKeyViolation(error: PostgrestError): boolean {
  return error.code === PG_FOREIGN_KEY_VIOLATION;
}
