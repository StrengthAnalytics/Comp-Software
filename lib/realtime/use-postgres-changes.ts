'use client';

import { useEffect, useId, useRef } from 'react';
import type { RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
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

// The channel lifecycle status Supabase reports to `.subscribe()`: 'SUBSCRIBED' once the channel is
// live, then 'TIMED_OUT' / 'CHANNEL_ERROR' / 'CLOSED' when the websocket drops. Surfaced so a screen
// can show a live/reconnecting indicator. (Template literal over the enum gives its plain string
// values, so callers compare against 'SUBSCRIBED' rather than importing the enum.)
export type ChannelStatus = `${REALTIME_SUBSCRIBE_STATES}`;

export type PostgresChangesOptions<Row extends Record<string, unknown>> = {
  table: string;
  // PostgREST-style row filter, e.g. `competition_id=eq.<uuid>`. Scopes the subscription so payloads
  // stay small (real-time conventions in CLAUDE.md).
  filter?: string;
  event?: PostgresEvent;
  // When false, no channel is opened. Lets callers wait for an id before subscribing.
  enabled?: boolean;
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
  // Optional: called with the channel's subscribe status whenever it changes, so a caller can track
  // connection health (e.g. the run screen's live/reconnecting pill).
  onStatusChange?: (status: ChannelStatus) => void;
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
  onStatusChange,
}: PostgresChangesOptions<Row>): void {
  // Stable per hook instance so two subscriptions to the same table/filter get distinct channels.
  const channelId = useId();

  // Hold the latest callbacks in refs so inline (re-created each render) handlers do not resubscribe
  // the channel on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

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
      .subscribe((status) => onStatusChangeRef.current?.(status));

    return () => {
      void client.removeChannel(channel);
    };
  }, [table, filter, event, enabled, channelId]);
}
