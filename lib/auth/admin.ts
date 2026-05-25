import { createClient } from '@/lib/supabase/server';

// Thrown when the current user is not a signed-in admin. Server actions catch this and
// surface a user-friendly message.
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Parses ADMIN_EMAILS (comma-separated) and reports whether the given email is an admin.
// Case-insensitive and whitespace-tolerant. Server-only: ADMIN_EMAILS has no NEXT_PUBLIC_ prefix.
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const allowList = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return allowList.includes(email.trim().toLowerCase());
}

// Enforces that the current request is from a signed-in admin. Returns the admin's email on
// success; throws AuthorizationError otherwise. This is the sole authorization gate on
// mutations, so it must run server-side in every server action that writes.
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthorizationError('Not authenticated.');
  }

  const email = user.email;

  if (!email || !isAdmin(email)) {
    throw new AuthorizationError('Not authorised.');
  }

  return email;
}
