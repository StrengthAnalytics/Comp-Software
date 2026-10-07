import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionDisplayLabels } from '@/lib/sessions/schedule';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

export type SessionOption = { id: string; name: string };

// A comp's sessions in running order, each named the way the operator should see it in a list of
// several (lib/sessions/schedule.ts spells out the day, and the platform, whenever a bare "Session 1"
// would be ambiguous). Used by the screens that offer a session picker — weigh-in, rack heights.
export async function loadSessionOptions(supabase: Client, competitionId: string): Promise<SessionOption[]> {
  const [sessionsResult, platformsResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, session_date, platform_id, sort_order')
      .eq('competition_id', competitionId)
      .order('sort_order', { ascending: true }),
    supabase.from('platforms').select('id, name').eq('competition_id', competitionId),
  ]);

  const sessions = sessionsResult.data ?? [];
  const labels = sessionDisplayLabels(
    sessions,
    new Map((platformsResult.data ?? []).map((platform) => [platform.id, platform.name])),
  );
  return sessions.map((session) => ({ id: session.id, name: labels.get(session.id) ?? session.name }));
}
