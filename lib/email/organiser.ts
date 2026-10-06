import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// A competition's organiser email (competition_organisers): where its rota change requests are sent
// and where lifters' replies to their entry emails go. Null when the comp has none set, and the
// caller falls back to the env-var addresses.
//
// The address is admin-only and never anon-readable. An admin session reads the table itself. The
// two anonymous actions (entry submit, rota change request) have no read on it, so they read this one
// column server-side with the service-role client — the only use of that client, kept to this fixed
// query so the anonymous caller can't steer it. Nothing here reaches the browser. Without the
// service-role key set, the anonymous path simply finds no address and the env-var fallback applies.
// A read error is logged and treated as "none set", so a missing address never stops the email or
// the action that triggered it.
export async function readOrganiserEmail(
  supabase: Client,
  competitionId: string,
  session: 'admin' | 'public',
): Promise<string | null> {
  if (session === 'public' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const client = session === 'admin' ? supabase : createAdminClient();
  const { data, error } = await client
    .from('competition_organisers')
    .select('email')
    .eq('competition_id', competitionId)
    .maybeSingle();
  if (error) {
    Sentry.captureException(error);
    return null;
  }
  return data?.email?.trim() || null;
}
