import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// A competition's organiser email (competition_organisers): where its rota change requests are sent
// and where lifters' replies to their entry emails go. Null when the comp has none set, and the
// caller falls back to the env-var addresses.
//
// An admin session reads the table itself. The two anonymous actions (entry submit, rota change
// request) read the public_comp_organisers view, which only returns the address while the comp's
// entry form or rota is open. A read error is logged and treated as "none set", so a missing
// address never stops the email or the action that triggered it.
export async function readOrganiserEmail(
  supabase: Client,
  competitionId: string,
  session: 'admin' | 'public',
): Promise<string | null> {
  const { data, error } =
    session === 'admin'
      ? await supabase.from('competition_organisers').select('email').eq('competition_id', competitionId).maybeSingle()
      : await supabase.from('public_comp_organisers').select('email').eq('competition_id', competitionId).maybeSingle();
  if (error) {
    Sentry.captureException(error);
    return null;
  }
  return data?.email?.trim() || null;
}
