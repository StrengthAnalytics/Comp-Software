'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Sex } from '@/lib/scoring/ipf-gl';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import { useFlightsSubscription } from '@/lib/realtime/use-flights-subscription';
import type { ChannelStatus } from '@/lib/realtime/use-postgres-changes';
import { deriveConnectionState, type ConnectionState } from '@/lib/realtime/connection-status';
import { useOnline } from '@/lib/use-online';
import type { BoardAttempt, BoardEntry, BoardFlight, NamedOption } from '@/lib/scorekeeper/board-types';

type AttemptRow = Database['public']['Tables']['attempts']['Row'];
type EntryRow = Database['public']['Tables']['entries']['Row'];
type FlightRow = Database['public']['Tables']['flights']['Row'];
type LiftType = Database['public']['Enums']['lift_type'];

// Stable empty default so callers that don't have weight classes/age categories (e.g. the loading display)
// don't recreate an array — and the lookup maps below — on every render.
const NO_OPTIONS: NamedOption[] = [];

// Natural key for an attempt (entry + lift + attempt number), so an optimistic insert and the realtime
// insert that follows it collapse onto the same cell instead of duplicating.
export function attemptKey(entryId: string, lift: LiftType, attemptNumber: number): string {
  return `${entryId}:${lift}:${attemptNumber}`;
}

function mapAttempt(row: AttemptRow): BoardAttempt {
  return {
    id: row.id,
    entryId: row.entry_id,
    lift: row.lift,
    attemptNumber: row.attempt_number,
    weightKg: row.weight_kg,
    result: row.result,
    decidedAt: row.decided_at,
  };
}

// Attempts are keyed by their natural key so an optimistic insert and the realtime insert that follows
// it collapse onto the same cell instead of duplicating.
export function applyAttemptChange(
  current: Map<string, BoardAttempt>,
  payload: RealtimePostgresChangesPayload<AttemptRow>,
): Map<string, BoardAttempt> {
  const next = new Map(current);
  if (payload.eventType === 'DELETE') {
    const old = payload.old;
    if (old.entry_id && old.lift && old.attempt_number) {
      next.delete(attemptKey(old.entry_id, old.lift, old.attempt_number));
    }
    return next;
  }
  const attempt = mapAttempt(payload.new);
  next.set(attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt);
  return next;
}

export function applyEntryChange(
  rows: BoardEntry[],
  payload: RealtimePostgresChangesPayload<EntryRow>,
  nameById: Map<string, string>,
  sexById: Map<string, Sex>,
  classNameById: Map<string, string>,
  ageCategoryNameById: Map<string, string>,
  teamNameById: Map<string, string>,
): BoardEntry[] {
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    return removedId ? rows.filter((row) => row.id !== removedId) : rows;
  }
  const changed = payload.new;
  const existing = rows.find((row) => row.id === changed.id);
  // Sex comes from the lifter, not the entry row, so it can't be read off the realtime payload —
  // preserve the existing value (or the initial-load map), defaulting to male like asSex.
  const mapped: BoardEntry = {
    id: changed.id,
    lifterName: existing?.lifterName ?? nameById.get(changed.id) ?? '—',
    sex: existing?.sex ?? sexById.get(changed.id) ?? 'male',
    flightId: changed.flight_id,
    lotNumber: changed.lot_number,
    teamLift: changed.team_lift,
    teamId: changed.team_id,
    teamName: changed.team_id ? (teamNameById.get(changed.team_id) ?? null) : null,
    bodyweightKg: changed.bodyweight_kg,
    weightClassId: changed.weight_class_id,
    weightClassName: changed.weight_class_id ? (classNameById.get(changed.weight_class_id) ?? null) : null,
    ageCategoryId: changed.age_category_id,
    ageCategoryName: changed.age_category_id ? (ageCategoryNameById.get(changed.age_category_id) ?? null) : null,
    rackHeightSquat: changed.rack_height_squat,
    squatRackSetting: changed.squat_rack_setting,
    rackHeightBench: changed.rack_height_bench,
    benchSafetyHeight: changed.bench_safety_height,
    benchSpotting: changed.bench_spotting,
  };
  const index = rows.findIndex((row) => row.id === mapped.id);
  if (index === -1) {
    return [...rows, mapped];
  }
  const next = [...rows];
  next[index] = mapped;
  return next;
}

export function applyFlightChange(
  rows: BoardFlight[],
  payload: RealtimePostgresChangesPayload<FlightRow>,
): BoardFlight[] {
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    return removedId ? rows.filter((row) => row.id !== removedId) : rows;
  }
  const changed = payload.new;
  const mapped: BoardFlight = {
    id: changed.id,
    sessionId: changed.session_id,
    name: changed.name,
    sortOrder: changed.sort_order,
  };
  const index = rows.findIndex((row) => row.id === mapped.id);
  if (index === -1) {
    return [...rows, mapped];
  }
  const next = [...rows];
  next[index] = mapped;
  return next;
}

export type BoardState = {
  attempts: Map<string, BoardAttempt>;
  setAttempts: Dispatch<SetStateAction<Map<string, BoardAttempt>>>;
  entries: BoardEntry[];
  setEntries: Dispatch<SetStateAction<BoardEntry[]>>;
  flights: BoardFlight[];
  // Live-update connection health, combining browser connectivity with the realtime channels' status.
  // Surfaced so a screen can show a live/reconnecting/offline indicator.
  connection: ConnectionState;
};

// The three board subscriptions whose channel status feeds the connection indicator.
type BoardChannel = 'attempts' | 'entries' | 'flights';

// Shared live board state for the run screen and the loading-crew display: seeds attempts/entries/
// flights from the server snapshot, reconciles realtime changes (scoped to the competition), and
// re-seeds when fresh props arrive after a manual refresh. The attempts/entries setters are returned
// so the run screen can apply optimistic updates; the realtime subscription reconciles on success.
// Weight classes and age categories are optional — only the run screen renders those columns, so the
// loading display omits them and the entry reconciler leaves them null.
export function useBoardState({
  competitionId,
  initialAttempts,
  initialEntries,
  initialFlights,
  weightClasses = NO_OPTIONS,
  ageCategories = NO_OPTIONS,
  teams = NO_OPTIONS,
}: {
  competitionId: string;
  initialAttempts: BoardAttempt[];
  initialEntries: BoardEntry[];
  initialFlights: BoardFlight[];
  weightClasses?: NamedOption[];
  ageCategories?: NamedOption[];
  teams?: NamedOption[];
}): BoardState {
  const [attempts, setAttempts] = useState<Map<string, BoardAttempt>>(
    () => new Map(initialAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
  );
  const [entries, setEntries] = useState<BoardEntry[]>(initialEntries);
  const [flights, setFlights] = useState<BoardFlight[]>(initialFlights);

  const nameById = useMemo(() => new Map(initialEntries.map((entry) => [entry.id, entry.lifterName])), [initialEntries]);
  const sexById = useMemo(() => new Map(initialEntries.map((entry) => [entry.id, entry.sex])), [initialEntries]);
  const classNameById = useMemo(() => new Map(weightClasses.map((option) => [option.id, option.name])), [weightClasses]);
  const ageCategoryNameById = useMemo(
    () => new Map(ageCategories.map((option) => [option.id, option.name])),
    [ageCategories],
  );
  const teamNameById = useMemo(() => new Map(teams.map((option) => [option.id, option.name])), [teams]);

  // Track each channel's subscribe status so the board can show a live/reconnecting/offline pill. All
  // three multiplex over one websocket, so they rise and fall together, but aggregating all three is
  // robust if one channel errors on its own. The setter no-ops when the status is unchanged so a
  // repeated callback doesn't re-render.
  const [channelStatuses, setChannelStatuses] = useState<Partial<Record<BoardChannel, ChannelStatus>>>({});
  const trackStatus = (channel: BoardChannel, status: ChannelStatus) =>
    setChannelStatuses((current) => (current[channel] === status ? current : { ...current, [channel]: status }));
  const online = useOnline();
  const connection = deriveConnectionState(online, [
    channelStatuses.attempts,
    channelStatuses.entries,
    channelStatuses.flights,
  ]);

  useAttemptsSubscription(competitionId, (payload) => setAttempts((current) => applyAttemptChange(current, payload)), {
    onStatusChange: (status) => trackStatus('attempts', status),
  });
  useEntriesSubscription(
    competitionId,
    (payload) =>
      setEntries((current) =>
        applyEntryChange(current, payload, nameById, sexById, classNameById, ageCategoryNameById, teamNameById),
      ),
    { onStatusChange: (status) => trackStatus('entries', status) },
  );
  useFlightsSubscription(competitionId, (payload) => setFlights((current) => applyFlightChange(current, payload)), {
    onStatusChange: (status) => trackStatus('flights', status),
  });

  // Re-seed from the server when fresh props arrive (e.g. a manual refresh after a realtime gap), so
  // reloading the page recovers correct state rather than keeping a stale local copy. Props only change
  // on a server re-render, never on a realtime-driven client re-render.
  useEffect(() => {
    setAttempts(
      new Map(initialAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
    );
  }, [initialAttempts]);
  useEffect(() => setEntries(initialEntries), [initialEntries]);
  useEffect(() => setFlights(initialFlights), [initialFlights]);

  return { attempts, setAttempts, entries, setEntries, flights, connection };
}
