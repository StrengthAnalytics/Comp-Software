'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { usePostgresChanges, type ChannelStatus, type PostgresEvent } from '@/lib/realtime/use-postgres-changes';

type EntrySubmissionRow = Database['public']['Tables']['entry_submissions']['Row'];

// Subscribes to public entry-form submission changes for one competition, so the entries screen's
// review inbox refreshes as lifters submit (or another device approves/rejects). Admin-only in
// practice: subscriptions inherit RLS, and anon has no read on entry_submissions.
export function useEntrySubmissionsSubscription(
  competitionId: string,
  onChange: (payload: RealtimePostgresChangesPayload<EntrySubmissionRow>) => void,
  options?: { enabled?: boolean; event?: PostgresEvent; onStatusChange?: (status: ChannelStatus) => void },
): void {
  usePostgresChanges<EntrySubmissionRow>({
    table: 'entry_submissions',
    filter: `competition_id=eq.${competitionId}`,
    event: options?.event,
    enabled: (options?.enabled ?? true) && competitionId.length > 0,
    onChange,
    onStatusChange: options?.onStatusChange,
  });
}
