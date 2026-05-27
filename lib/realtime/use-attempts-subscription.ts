'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type AttemptRow = Database['public']['Tables']['attempts']['Row'];

// Subscribes to attempt changes for one competition. Used by the scorekeeper, the public live view,
// and the scoreboard/lifter/attempt overlays.
export function useAttemptsSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<AttemptRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent },
): void {
  usePostgresChanges<AttemptRow>({
    table: 'attempts',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
  });
}
