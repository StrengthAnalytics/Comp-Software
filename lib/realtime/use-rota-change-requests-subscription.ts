'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type ChannelStatus, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type RotaChangeRequestRow = Database['public']['Tables']['rota_change_requests']['Row'];

// Subscribes to volunteer "Request a change" submissions for one competition, so the admin rota
// screen's request list updates live as volunteers send them (or another device marks one done).
// Admin-only in practice: subscriptions inherit RLS, and anon has no read on rota_change_requests.
export function useRotaChangeRequestsSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<RotaChangeRequestRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent; onStatusChange?: (status: ChannelStatus) => void },
): void {
  usePostgresChanges<RotaChangeRequestRow>({
    table: 'rota_change_requests',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
    onStatusChange: options?.onStatusChange,
  });
}
