import type { ChannelStatus } from '@/lib/realtime/use-postgres-changes';

// Whether the live board is receiving updates: 'live' once the browser is online and every realtime
// channel is subscribed, 'connecting' while online but one or more channels are not yet subscribed
// (initial connect or a websocket retry), and 'offline' when the browser itself has no connection.
export type ConnectionState = 'live' | 'connecting' | 'offline';

// Derives the connection state from browser connectivity and the realtime channels' subscribe
// statuses. The browser being offline takes priority (every channel is doomed anyway); otherwise the
// board is only 'live' once all channels report 'SUBSCRIBED'. An empty list (before any status has
// arrived) reads as 'connecting', so a fresh mount shows reconnecting until the sockets are up rather
// than briefly claiming to be live. Pure; unit-tested.
export function deriveConnectionState(
  online: boolean,
  channelStatuses: readonly (ChannelStatus | undefined)[],
): ConnectionState {
  if (!online) {
    return 'offline';
  }
  const allSubscribed =
    channelStatuses.length > 0 && channelStatuses.every((status) => status === 'SUBSCRIBED');
  return allSubscribed ? 'live' : 'connecting';
}

// "1 change" / "3 changes" — pluralised count of edits held in the offline outbox.
function changeCount(pending: number): string {
  return `${pending} change${pending === 1 ? '' : 's'}`;
}

// Tailwind classes + copy for the connection pill, mirroring the weigh-in save indicator's shape so
// the two screens read the same. Green when live and nothing is queued, amber (pulsing) while
// reconnecting or syncing queued edits, red (pulsing) when offline. `pendingCount` is the number of
// edits held in the offline outbox waiting to reach the database; it changes the copy so the operator
// knows their work is held and will sync, not lost.
export type ConnectionIndicator = { text: string; dot: string; box: string; pulse: boolean };

export function computeConnectionIndicator(state: ConnectionState, pendingCount = 0): ConnectionIndicator {
  if (state === 'offline') {
    return {
      text: pendingCount > 0 ? `Offline — ${changeCount(pendingCount)} will sync when reconnected` : 'Offline — live updates paused',
      dot: 'bg-red-500',
      box: 'border-red-300 bg-red-50 text-red-800',
      pulse: true,
    };
  }
  if (state === 'connecting') {
    return {
      text: pendingCount > 0 ? `Reconnecting — ${changeCount(pendingCount)} pending` : 'Reconnecting…',
      dot: 'bg-amber-500',
      box: 'border-amber-300 bg-amber-50 text-amber-800',
      pulse: true,
    };
  }
  if (pendingCount > 0) {
    return {
      text: `Syncing ${changeCount(pendingCount)}…`,
      dot: 'bg-amber-500',
      box: 'border-amber-300 bg-amber-50 text-amber-800',
      pulse: true,
    };
  }
  return {
    text: 'Live',
    dot: 'bg-green-500',
    box: 'border-green-300 bg-green-50 text-green-800',
    pulse: false,
  };
}
