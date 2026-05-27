'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type EntryRow = Database['public']['Tables']['entries']['Row'];

// Subscribes to entry changes for one competition. Used by the scorekeeper, the flights screen,
// the public live view, and the overlays.
export function useEntriesSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<EntryRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent },
): void {
  usePostgresChanges<EntryRow>({
    table: 'entries',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
  });
}
