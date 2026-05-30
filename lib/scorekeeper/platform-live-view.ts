import type { Database } from '@/types/database.types';
import {
  selectLiveSession,
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { UNASSIGNED_PLATFORM } from '@/lib/scorekeeper/display-platforms';
import type { RosterItem } from '@/lib/scorekeeper/order-roster';
import type { BoardAttempt, BoardEntry, BoardFlight, BoardSession } from '@/lib/scorekeeper/board-types';

type AttemptResult = Database['public']['Enums']['attempt_result'];

// An attempt in a live session, placed in running order and joined to the lifter (entry) and flight it
// belongs to — so a caller can render the up-next cards (warm-up board) or a lifter lower-third
// (overlay) without re-joining. Extends RunningOrderFields so the running-order comparators sort it
// directly; satisfies SessionAttempt (entryId/lift/attemptNumber/weightKg/result) so the roster
// orderers accept it too.
export type PlatformLiveRow = RunningOrderFields & {
  entryId: string;
  result: AttemptResult;
  entry: BoardEntry;
  flight: BoardFlight;
};

export type PlatformLiveView = {
  // The session currently lifting on this platform, or null when the platform has no rostered session.
  liveSession: BoardSession | null;
  // The live session's lifters (one per entry, with their flight), to be ordered into a roster.
  rosterItems: RosterItem[];
  // The live session's declared/undeclared attempts in running-order shape, joined to entry + flight.
  liveRows: PlatformLiveRow[];
  // The next three lifters up: on platform / on deck / in the hole.
  positions: PlatformPositions<PlatformLiveRow>;
};

function emptyView(): PlatformLiveView {
  return { liveSession: null, rosterItems: [], liveRows: [], positions: { onPlatform: null, onDeck: null, inTheHole: null } };
}

// Derives the live session and the next-three-up positions for one platform from the board snapshot —
// the shared core behind the warm-up board's up-next cards and the lifter overlay's current-lifter
// lower-third, so the two can never disagree on who is on the platform. The roster comes from the
// session/flight structure (not from attempts), so a flight of weighed-in lifters shows before any
// attempt is declared; only a session with rostered lifters can be live, so an empty earlier session
// is skipped rather than freezing the platform on it. The live session is the earliest not-yet-finished
// one (a session is finished only once a later session has started lifting, so the platform holds
// through between-rounds gaps), and the positions are the first three pending attempts with a declared
// weight in running order. Pure; unit-tested. Mirrors the run screen's per-platform build.
export function buildPlatformLiveView({
  platformId,
  sessions,
  flights,
  entries,
  attempts,
}: {
  platformId: string;
  sessions: readonly BoardSession[];
  flights: readonly BoardFlight[];
  entries: readonly BoardEntry[];
  attempts: Iterable<BoardAttempt>;
}): PlatformLiveView {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  // Roster comes from session/flight structure so weighed-in lifters show before any attempt exists.
  const rosterBySession = new Map<string, RosterItem[]>();
  for (const entry of entries) {
    const flight = entry.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!flight || !session || (session.platformId ?? UNASSIGNED_PLATFORM.id) !== platformId) {
      continue;
    }
    const list = rosterBySession.get(session.id) ?? [];
    list.push({ entry, flight });
    rosterBySession.set(session.id, list);
  }

  // Only sessions with rostered lifters can be live: an empty earlier session is never "finished" and
  // would otherwise be picked as live, freezing the platform on it.
  const platformSessions = sessions
    .filter(
      (session) =>
        (session.platformId ?? UNASSIGNED_PLATFORM.id) === platformId &&
        (rosterBySession.get(session.id)?.length ?? 0) > 0,
    )
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
  if (platformSessions.length === 0) {
    return emptyView();
  }
  const platformSessionIds = new Set(platformSessions.map((session) => session.id));

  // Attempt rows joined to their session, for running-order positions and per-session counts.
  const rowsBySession = new Map<string, PlatformLiveRow[]>();
  const attemptCountBySession = new Map<string, number>();
  const pendingCountBySession = new Map<string, number>();
  for (const attempt of attempts) {
    const entry = entryById.get(attempt.entryId);
    const flight = entry?.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!entry || !flight || !session || !platformSessionIds.has(session.id)) {
      continue;
    }
    const list = rowsBySession.get(session.id) ?? [];
    list.push({
      entryId: attempt.entryId,
      lift: attempt.lift,
      attemptNumber: attempt.attemptNumber,
      weightKg: attempt.weightKg,
      lotNumber: entry.lotNumber,
      flightSortOrder: flight.sortOrder,
      result: attempt.result,
      entry,
      flight,
    });
    rowsBySession.set(session.id, list);
    attemptCountBySession.set(session.id, (attemptCountBySession.get(session.id) ?? 0) + 1);
    if (attempt.result === 'pending' && attempt.weightKg !== null) {
      pendingCountBySession.set(session.id, (pendingCountBySession.get(session.id) ?? 0) + 1);
    }
  }

  const liveSession = selectLiveSession(platformSessions, attemptCountBySession, pendingCountBySession);
  if (!liveSession) {
    return emptyView();
  }
  const liveRows = rowsBySession.get(liveSession.id) ?? [];
  return {
    liveSession,
    rosterItems: rosterBySession.get(liveSession.id) ?? [],
    liveRows,
    positions: selectPlatformPositions(liveRows),
  };
}
