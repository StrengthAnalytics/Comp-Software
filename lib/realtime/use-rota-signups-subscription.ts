'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type ChannelStatus, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type RotaSignupRow = Database['public']['Tables']['rota_signups']['Row'];

// Subscribes to volunteer rota sign-up changes for one competition, so the admin rota screen updates
// live as volunteers claim slots (or another device removes one). Admin-only in practice:
// subscriptions inherit RLS, and anon has no read on rota_signups.
export function useRotaSignupsSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<RotaSignupRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent; onStatusChange?: (status: ChannelStatus) => void },
): void {
  usePostgresChanges<RotaSignupRow>({
    table: 'rota_signups',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
    onStatusChange: options?.onStatusChange,
  });
}
