import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

// The full set of competition roles as stored in Postgres (includes v2 referee/jury).
type CompRoleValue = Database['public']['Enums']['comp_role'];

// Thrown when the current user may not perform an operation on a competition.
// Server actions catch this and surface a user-friendly message.
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Enforces that the current user holds one of allowedRoles in the given competition.
// Returns the user's role on success; throws AuthorizationError otherwise.
export async function requireRole(
  competitionId: string,
  allowedRoles: readonly CompRoleValue[],
): Promise<CompRoleValue> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthorizationError('Not authenticated.');
  }

  const { data, error } = await supabase
    .from('comp_roles')
    .select('role')
    .eq('competition_id', competitionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new AuthorizationError(`Failed to resolve competition role: ${error.message}`);
  }

  if (!data) {
    throw new AuthorizationError('No role assigned for this competition.');
  }

  if (!allowedRoles.includes(data.role)) {
    throw new AuthorizationError(`Role "${data.role}" is not permitted for this operation.`);
  }

  return data.role;
}
