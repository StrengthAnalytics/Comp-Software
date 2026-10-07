import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionSortOrderUpdates } from '@/lib/sessions/schedule';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// Keeps a comp's sessions numbered in time order (lib/sessions/schedule.ts has the rule), so the
// operator never types a sort order and the run screen's "first unfinished session" is always the
// earliest one. Run by the session actions after a write and before the rota sync (which orders the
// rota's session columns by the same sort_order). Writes only the rows whose position changed.
//
// Returns the first error rather than throwing: the caller's own write has already succeeded, so it
// logs the error and still reports success (the next session save re-sequences).
export async function resequenceSessions(supabase: Client, competitionId: string): Promise<{ error: unknown }> {
  const [sessionsResult, platformsResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, session_date, lift_off_time, platform_id, sort_order, created_at')
      .eq('competition_id', competitionId),
    supabase.from('platforms').select('id, name').eq('competition_id', competitionId),
  ]);
  const readError = sessionsResult.error ?? platformsResult.error;
  if (readError) {
    return { error: readError };
  }

  const updates = sessionSortOrderUpdates(
    sessionsResult.data ?? [],
    new Map((platformsResult.data ?? []).map((platform) => [platform.id, platform.name])),
  );
  const results = await Promise.all(
    updates.map(({ id, sort_order }) => supabase.from('sessions').update({ sort_order }).eq('id', id)),
  );
  return { error: results.find((result) => result.error)?.error ?? null };
}
