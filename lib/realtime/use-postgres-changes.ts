'use client';

import { useEffect, useId, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type SupabaseBrowserClient = ReturnType<typeof createClient>;

// One browser client (one websocket) shared by every subscription hook. Creating a client per hook
// would open a fresh connection each time; a single shared client multiplexes channels over one.
let sharedClient: SupabaseBrowserClient | null = null;

function getBrowserClient(): SupabaseBrowserClient {
  sharedClient ??= createClient();
  return sharedClient;
}

export type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export type PostgresChangesOptions<Row extends Record<string, unknown>> = {
  table: string;
  // PostgREST-style row filter, e.g. `competition_id=eq.<uuid>`. Scopes the subscription so payloads
  // stay small (real-time conventions in CLAUDE.md).
  filter?: string;
  event?: PostgresEvent;
  // When false, no channel is opened. Lets callers wait for an id before subscribing.
  enabled?: boolean;
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
};

// Base real-time hook: opens one Supabase channel for a Postgres-changes subscription and tears it
// down on unmount or when the inputs change. Specific table hooks (useAttemptsSubscription, etc.)
// wrap this; components never call the Supabase channel API directly.
export function usePostgresChanges<Row extends Record<string, unknown>>({
  table,
  filter,
  event = '*',
  enabled = true,
  onChange,
}: PostgresChangesOptions<Row>): void {
  // Stable per hook instance so two subscriptions to the same table/filter get distinct channels.
  const channelId = useId();

  // Hold the latest callback in a ref so an inline (re-created each render) handler does not
  // resubscribe the channel on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const client = getBrowserClient();
    const channel = client
      .channel(`pg:${table}:${channelId}`)
      .on<Row>(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => onChangeRef.current(payload),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [table, filter, event, enabled, channelId]);
}
