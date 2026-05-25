import { fail, type ActionResult } from '@/types/action-result';
import { requireAdmin } from '@/lib/auth/admin';

// Runs the admin gate for a server action. Returns null when the caller is an admin, or an error
// ActionResult to return immediately otherwise. Keeps the guard out of the success path so that a
// subsequent redirect() is never swallowed by a try/catch.
export async function adminGuard(): Promise<ActionResult<never> | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return fail('You need to be signed in as an admin to do that.');
  }
}
