import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/admin';

// Page/layout-level admin gate: redirects to /auth unless the current session is an allow-listed
// admin, and returns the admin user otherwise. Shared by the (admin) layout (chrome) and the
// (display) layout (chrome-less venue screens) so both gate identically — the ADMIN_EMAILS check in
// isAdmin() is the single source. This is the page counterpart to requireAdmin(), which throws for
// server actions; here we redirect, which is the right behaviour for a navigation.
export async function requireAdminPage(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect('/auth');
  }

  return user;
}
