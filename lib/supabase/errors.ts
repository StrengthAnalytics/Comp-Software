import type { PostgrestError } from '@supabase/supabase-js';

// Postgres SQLSTATE for a unique-constraint violation.
const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === PG_UNIQUE_VIOLATION;
}
