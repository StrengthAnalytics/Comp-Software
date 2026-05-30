'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type ChannelStatus, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type FlightRow = Database['public']['Tables']['flights']['Row'];

// Subscribes to flight changes for one competition. Used by the flights screen and the scorekeeper.
export function useFlightsSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<FlightRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent; onStatusChange?: (status: ChannelStatus) => void },
): void {
  usePostgresChanges<FlightRow>({
    table: 'flights',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
    onStatusChange: options?.onStatusChange,
  });
}
