'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  ATTEMPTS_PER_LIFT,
  BENCH_SPOTTING_LABELS,
  LIFT_LABELS,
  SQUAT_RACK_SETTING_LABELS,
  type BenchSpotting,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { bestGoodLift } from '@/lib/attempts/best-lift';
import {
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import { useFlightsSubscription } from '@/lib/realtime/use-flights-subscription';
import { setAttemptResultAction, setAttemptWeightAction } from '@/actions/attempts';
import type { ActionResult } from '@/types/action-result';

type AttemptRow = Database['public']['Tables']['attempts']['Row'];
type EntryRow = Database['public']['Tables']['entries']['Row'];
type FlightRow = Database['public']['Tables']['flights']['Row'];
type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

export type NamedOption = { id: string; name: string };
export type BoardPlatform = { id: string; name: string };
export type BoardSession = { id: string; name: string; sortOrder: number; platformId: string | null };
export type BoardFlight = { id: string; sessionId: string; name: string; sortOrder: number };
export type BoardEntry = {
  id: string;
  lifterName: string;
  flightId: string | null;
  lotNumber: number | null;
  teamLift: LiftType | null;
  bodyweightKg: number | null;
  weightClassName: string | null;
  divisionName: string | null;
  rackHeightSquat: number | null;
  squatRackSetting: SquatRackSetting | null;
  rackHeightBench: number | null;
  benchSafetyHeight: number | null;
  benchSpotting: BenchSpotting | null;
};
export type BoardAttempt = {
  id: string;
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
};

type ScoresheetBoardProps = {
  competitionId: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  weightClasses: NamedOption[];
  divisions: NamedOption[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// Attempt numbers 1..3 (CLAUDE.md: three attempts per lift), derived so the literal lives once.
const ATTEMPT_NUMBERS = Array.from({ length: ATTEMPTS_PER_LIFT }, (_, index) => index + 1);

const GHOST_BUTTON = 'rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const HEAD = 'border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600';
const CELL = 'border border-neutral-200 px-2 py-1 align-middle';
const CELL_INPUT = 'w-14 rounded border border-neutral-300 px-1 py-0.5 text-center text-sm tabular-nums text-neutral-900 focus:border-neutral-500 focus:outline-none';

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

// Prefix for an optimistic attempt id that has not yet been persisted (no real uuid yet).
const TEMP_ID_PREFIX = 'temp:';

function attemptKey(entryId: string, lift: LiftType, attemptNumber: number): string {
  return `${entryId}:${lift}:${attemptNumber}`;
}

function liftHasRack(lift: LiftType): boolean {
  return lift === 'squat' || lift === 'bench';
}

function rackText(entry: BoardEntry, lift: LiftType): string {
  if (lift === 'squat') {
    const parts: string[] = [];
    if (entry.rackHeightSquat !== null) {
      parts.push(String(entry.rackHeightSquat));
    }
    if (entry.squatRackSetting) {
      parts.push(SQUAT_RACK_SETTING_LABELS[entry.squatRackSetting]);
    }
    return parts.length > 0 ? parts.join(' ') : '—';
  }
  if (lift === 'bench') {
    const parts: string[] = [];
    if (entry.rackHeightBench !== null) {
      parts.push(`R${entry.rackHeightBench}`);
    }
    if (entry.benchSafetyHeight !== null) {
      parts.push(`S${entry.benchSafetyHeight}`);
    }
    if (entry.benchSpotting) {
      parts.push(BENCH_SPOTTING_LABELS[entry.benchSpotting]);
    }
    return parts.length > 0 ? parts.join(' ') : '—';
  }
  return '—';
}

// Background tint for an attempt cell: green for a good lift, red for a no lift, neutral for another
// terminal result, amber for the lifter currently on the platform, untinted while simply pending.
function cellTint(attempt: BoardAttempt | undefined, isCurrent: boolean): string {
  if (attempt && attempt.weightKg !== null) {
    if (attempt.result === 'good_lift') {
      return 'bg-green-200';
    }
    if (attempt.result === 'no_lift') {
      return 'bg-red-200';
    }
    if (attempt.result !== 'pending') {
      return 'bg-neutral-200';
    }
  }
  return isCurrent ? 'bg-amber-100' : '';
}

function mapAttempt(row: AttemptRow): BoardAttempt {
  return {
    id: row.id,
    entryId: row.entry_id,
    lift: row.lift,
    attemptNumber: row.attempt_number,
    weightKg: row.weight_kg,
    result: row.result,
  };
}

// Attempts are keyed by their natural key (entry + lift + attempt number) so an optimistic insert and
// the realtime insert that follows it collapse onto the same cell instead of duplicating.
function applyAttemptChange(
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

function applyEntryChange(
  rows: BoardEntry[],
  payload: RealtimePostgresChangesPayload<EntryRow>,
  nameById: Map<string, string>,
  classNameById: Map<string, string>,
  divisionNameById: Map<string, string>,
): BoardEntry[] {
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    return removedId ? rows.filter((row) => row.id !== removedId) : rows;
  }
  const changed = payload.new;
  const existing = rows.find((row) => row.id === changed.id);
  const mapped: BoardEntry = {
    id: changed.id,
    lifterName: existing?.lifterName ?? nameById.get(changed.id) ?? '—',
    flightId: changed.flight_id,
    lotNumber: changed.lot_number,
    teamLift: changed.team_lift,
    bodyweightKg: changed.bodyweight_kg,
    weightClassName: changed.weight_class_id ? (classNameById.get(changed.weight_class_id) ?? null) : null,
    divisionName: changed.division_id ? (divisionNameById.get(changed.division_id) ?? null) : null,
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

function applyFlightChange(
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

// A session is finished only once a LATER session on the platform has begun lifting — so the live
// session stays put through between-rounds gaps (no pending rows for a moment) and only rolls forward
// when the next session actually starts.
function isSessionFinished(
  session: BoardSession,
  platformSessions: readonly BoardSession[],
  attemptCountBySession: Map<string, number>,
  pendingCountBySession: Map<string, number>,
): boolean {
  const hasAttempts = (attemptCountBySession.get(session.id) ?? 0) > 0;
  const hasPending = (pendingCountBySession.get(session.id) ?? 0) > 0;
  const laterSessionStarted = platformSessions.some(
    (other) => other.sortOrder > session.sortOrder && (attemptCountBySession.get(other.id) ?? 0) > 0,
  );
  return hasAttempts && !hasPending && laterSessionStarted;
}

type RunRow = RunningOrderFields & { entryId: string; lifterName: string; flightName: string };

type PlatformView = {
  key: string;
  platformName: string | null;
  sessionName: string | null;
  positions: PlatformPositions<RunRow>;
  roster: { entry: BoardEntry; flightName: string }[];
};

function buildPlatformViews({
  platforms,
  sessions,
  flights,
  entries,
  attempts,
}: {
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: Map<string, BoardAttempt>;
}): PlatformView[] {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  // Attempt rows joined to their session, for running-order positions and per-session counts.
  const rowsBySession = new Map<string, (RunRow & { result: AttemptResult })[]>();
  const attemptCountBySession = new Map<string, number>();
  const pendingCountBySession = new Map<string, number>();
  for (const attempt of attempts.values()) {
    const entry = entryById.get(attempt.entryId);
    const flight = entry?.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!entry || !flight || !session) {
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
      lifterName: entry.lifterName,
      flightName: flight.name,
    });
    rowsBySession.set(session.id, list);
    attemptCountBySession.set(session.id, (attemptCountBySession.get(session.id) ?? 0) + 1);
    if (attempt.result === 'pending' && attempt.weightKg !== null) {
      pendingCountBySession.set(session.id, (pendingCountBySession.get(session.id) ?? 0) + 1);
    }
  }

  // Roster comes from session/flight structure, not attempts, so a flight of weighed-in lifters
  // shows even before any attempt is declared.
  const rosterBySession = new Map<string, { entry: BoardEntry; flight: BoardFlight }[]>();
  for (const entry of entries) {
    const flight = entry.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!flight || !session) {
      continue;
    }
    const list = rosterBySession.get(session.id) ?? [];
    list.push({ entry, flight });
    rosterBySession.set(session.id, list);
  }

  const platformKeys = new Set<string>();
  for (const session of sessions) {
    platformKeys.add(session.platformId ?? 'none');
  }

  const views: PlatformView[] = [];
  for (const key of platformKeys) {
    // Sessions on this platform that actually have lifters, in running order.
    const platformSessions = sessions
      .filter((session) => (session.platformId ?? 'none') === key && (rosterBySession.get(session.id)?.length ?? 0) > 0)
      .toSorted((a, b) => a.sortOrder - b.sortOrder);
    if (platformSessions.length === 0) {
      continue;
    }

    // The live session is the earliest not-yet-finished one (platformSessions is non-empty).
    const liveSession =
      platformSessions.find(
        (session) => !isSessionFinished(session, platformSessions, attemptCountBySession, pendingCountBySession),
      ) ?? platformSessions.at(-1);
    if (!liveSession) {
      continue;
    }

    const roster = (rosterBySession.get(liveSession.id) ?? [])
      .toSorted((a, b) =>
        a.flight.sortOrder === b.flight.sortOrder
          ? (a.entry.lotNumber ?? Number.POSITIVE_INFINITY) - (b.entry.lotNumber ?? Number.POSITIVE_INFINITY)
          : a.flight.sortOrder - b.flight.sortOrder,
      )
      .map((item) => ({ entry: item.entry, flightName: item.flight.name }));

    views.push({
      key,
      platformName: key === 'none' ? null : (platformById.get(key)?.name ?? null),
      sessionName: liveSession.name,
      positions: selectPlatformPositions(rowsBySession.get(liveSession.id) ?? []),
      roster,
    });
  }

  return views.toSorted((a, b) => (a.platformName ?? '').localeCompare(b.platformName ?? ''));
}

export function ScoresheetBoard({
  competitionId,
  isTeamCompetition,
  lifts,
  platforms,
  sessions,
  flights: initialFlights,
  weightClasses,
  divisions,
  entries: initialEntries,
  attempts: initialAttempts,
}: ScoresheetBoardProps) {
  const [attempts, setAttempts] = useState<Map<string, BoardAttempt>>(
    () => new Map(initialAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
  );
  const [entries, setEntries] = useState<BoardEntry[]>(initialEntries);
  const [flights, setFlights] = useState<BoardFlight[]>(initialFlights);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  const nameById = useMemo(
    () => new Map(initialEntries.map((entry) => [entry.id, entry.lifterName])),
    [initialEntries],
  );
  const classNameById = useMemo(
    () => new Map(weightClasses.map((option) => [option.id, option.name])),
    [weightClasses],
  );
  const divisionNameById = useMemo(
    () => new Map(divisions.map((option) => [option.id, option.name])),
    [divisions],
  );

  useAttemptsSubscription(competitionId, (payload) => {
    setAttempts((current) => applyAttemptChange(current, payload));
  });
  useEntriesSubscription(competitionId, (payload) => {
    setEntries((current) => applyEntryChange(current, payload, nameById, classNameById, divisionNameById));
  });
  useFlightsSubscription(competitionId, (payload) => {
    setFlights((current) => applyFlightChange(current, payload));
  });

  // Re-seed from the server when fresh props arrive (e.g. a manual refresh after a realtime gap),
  // so reloading the page recovers correct state rather than keeping a stale local copy. Props only
  // change on a server re-render, never on a realtime-driven client re-render.
  useEffect(() => {
    setAttempts(
      new Map(initialAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
    );
  }, [initialAttempts]);
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);
  useEffect(() => {
    setFlights(initialFlights);
  }, [initialFlights]);

  // Esc leaves the expanded view.
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const columnLifts = useMemo(
    () => (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => lifts[lift]),
    [lifts],
  );

  const views = useMemo(
    () => buildPlatformViews({ platforms, sessions, flights, entries, attempts }),
    [platforms, sessions, flights, entries, attempts],
  );

  // Sets (or creates) an attempt's weight, optimistically. The existing result is preserved so a
  // weight correction keeps a recorded good/no lift; the server enforces the progression guard.
  function setWeight(entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) {
    const key = attemptKey(entry.id, lift, attemptNumber);
    const previous = attempts.get(key);
    setError(null);
    setAttempts((current) => {
      const next = new Map(current);
      next.set(key, {
        id: previous?.id ?? `temp:${key}`,
        entryId: entry.id,
        lift,
        attemptNumber,
        weightKg,
        result: previous?.result ?? 'pending',
      });
      return next;
    });
    startTransition(async () => {
      const result = await setAttemptWeightAction({ competitionId, entryId: entry.id, lift, attemptNumber, weightKg });
      if (result.status === 'error') {
        setAttempts((current) => {
          const next = new Map(current);
          if (previous) {
            next.set(key, previous);
          } else {
            next.delete(key);
          }
          return next;
        });
        setError(readError(result));
        return;
      }
      // Adopt the real id so a follow-up result targets the persisted row.
      setAttempts((current) => {
        const existing = current.get(key);
        if (!existing) {
          return current;
        }
        const next = new Map(current);
        next.set(key, { ...existing, id: result.data.id });
        return next;
      });
    });
  }

  function setResult(attempt: BoardAttempt, result: AttemptResult) {
    const key = attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber);
    setError(null);
    setAttempts((current) => {
      const existing = current.get(key);
      if (!existing) {
        return current;
      }
      const next = new Map(current);
      next.set(key, { ...existing, result });
      return next;
    });
    startTransition(async () => {
      const outcome = await setAttemptResultAction({ competitionId, attemptId: attempt.id, result });
      if (outcome.status === 'error') {
        setAttempts((current) => {
          const existing = current.get(key);
          if (!existing) {
            return current;
          }
          const next = new Map(current);
          next.set(key, { ...existing, result: attempt.result });
          return next;
        });
        setError(readError(outcome));
      }
    });
  }

  const hasRoster = views.some((view) => view.roster.length > 0);

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto bg-white p-4' : ''}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {expanded ? <h2 className="text-lg font-semibold text-neutral-900">Scoresheet</h2> : <span />}
        <button type="button" onClick={() => setExpanded((value) => !value)} className={GHOST_BUTTON}>
          {expanded ? 'Collapse (Esc)' : 'Expand to full screen'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {hasRoster ? (
        <div className="space-y-6">
          {views.map((view) => (
            <PlatformPanel
              key={view.key}
              view={view}
              attempts={attempts}
              columnLifts={columnLifts}
              isTeamCompetition={isTeamCompetition}
              onSetWeight={setWeight}
              onSetResult={setResult}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">
            No lifters in a flight yet. Assign lifters to flights and weigh them in to start the run.
          </p>
        </div>
      )}
    </div>
  );
}

function PlatformPanel({
  view,
  attempts,
  columnLifts,
  isTeamCompetition,
  onSetWeight,
  onSetResult,
}: {
  view: PlatformView;
  attempts: Map<string, BoardAttempt>;
  columnLifts: LiftType[];
  isTeamCompetition: boolean;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  const { platformName, sessionName, positions, roster } = view;
  const current = positions.onPlatform;

  const bestForLift = (entryId: string, lift: LiftType): number =>
    bestGoodLift(
      ATTEMPT_NUMBERS.map((attemptNumber) => attempts.get(attemptKey(entryId, lift, attemptNumber)))
        .filter((attempt): attempt is BoardAttempt => attempt !== undefined)
        .map((attempt) => ({ result: attempt.result, weightKg: attempt.weightKg })),
    );

  const entryTotal = (entry: BoardEntry): number => {
    const contributing = isTeamCompetition && entry.teamLift ? [entry.teamLift] : columnLifts;
    let total = 0;
    for (const lift of contributing) {
      total += bestForLift(entry.id, lift);
    }
    return total;
  };

  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <header>
        {platformName ? (
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{platformName}</p>
        ) : null}
        <h2 className="text-lg font-semibold text-neutral-900">{sessionName ?? 'No live session'}</h2>
        {current ? (
          <p className="text-sm text-neutral-500">
            {LIFT_LABELS[current.lift]} · Round {current.attemptNumber}
          </p>
        ) : null}
      </header>

      <div
        aria-live="polite"
        aria-label="Platform running order"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <PositionCard label="On platform" row={positions.onPlatform} highlight />
        <PositionCard label="On deck" row={positions.onDeck} />
        <PositionCard label="In the hole" row={positions.inTheHole} />
      </div>

      {roster.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={`sticky left-0 z-30 min-w-[11rem] text-left ${HEAD}`}>
                  Lifter
                </th>
                <th scope="col" className={`w-12 text-center ${HEAD}`}>
                  Lot
                </th>
                <th scope="col" className={`w-14 text-center ${HEAD}`}>
                  BW
                </th>
                <th scope="col" className={`w-28 text-left ${HEAD}`}>
                  Class
                </th>
                <th scope="col" className={`w-24 text-left ${HEAD}`}>
                  Div
                </th>
                {columnLifts.map((lift) => (
                  <FragmentHeader key={lift} lift={lift} />
                ))}
                <th scope="col" className={`w-20 text-center ${HEAD}`}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map(({ entry, flightName }) => {
                const total = entryTotal(entry);
                return (
                  <tr key={entry.id}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap bg-white ${CELL}`}>
                    <span className="font-medium text-neutral-900">{entry.lifterName}</span>
                    <span className="ml-2 text-xs text-neutral-400">{flightName}</span>
                  </td>
                  <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.lotNumber ?? '—'}</td>
                  <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.bodyweightKg ?? '—'}</td>
                  <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.weightClassName ?? '—'}</td>
                  <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.divisionName ?? '—'}</td>
                  {columnLifts.map((lift) => {
                    const active = isTeamCompetition ? entry.teamLift === lift : true;
                    const best = active ? bestForLift(entry.id, lift) : 0;
                    return (
                      <FragmentCells
                        key={lift}
                        lift={lift}
                        entry={entry}
                        active={active}
                        best={best}
                        attempts={attempts}
                        current={current}
                        onSetWeight={onSetWeight}
                        onSetResult={onSetResult}
                      />
                    );
                  })}
                  <td className={`text-center font-semibold tabular-nums text-neutral-900 ${CELL}`}>
                    {total > 0 ? total : '—'}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No lifters in this session.</p>
      )}
    </section>
  );
}

function FragmentHeader({ lift }: { lift: LiftType }) {
  return (
    <>
      {liftHasRack(lift) ? (
        <th scope="col" className={`w-24 text-center ${HEAD}`}>
          {LIFT_LABELS[lift]} rack
        </th>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => (
        <th key={`${lift}-${attemptNumber}`} scope="col" className={`w-[5.5rem] text-center ${HEAD}`}>
          {attemptNumber === 1 ? `${LIFT_LABELS[lift]} ${attemptNumber}` : String(attemptNumber)}
        </th>
      ))}
      <th scope="col" className={`w-16 text-center ${HEAD}`}>
        Best
      </th>
    </>
  );
}

function FragmentCells({
  lift,
  entry,
  active,
  best,
  attempts,
  current,
  onSetWeight,
  onSetResult,
}: {
  lift: LiftType;
  entry: BoardEntry;
  active: boolean;
  best: number;
  attempts: Map<string, BoardAttempt>;
  current: RunRow | null;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  return (
    <>
      {liftHasRack(lift) ? (
        <td className={`whitespace-nowrap text-center text-xs text-neutral-500 ${CELL}`}>
          {active ? rackText(entry, lift) : '—'}
        </td>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => {
        const attempt = attempts.get(attemptKey(entry.id, lift, attemptNumber));
        const isCurrent =
          current?.entryId === entry.id && current.lift === lift && current.attemptNumber === attemptNumber;
        return (
          <td key={`${entry.id}-${lift}-${attemptNumber}`} className={`text-center ${CELL} ${active ? cellTint(attempt, isCurrent) : ''}`}>
            {active ? (
              <AttemptCell
                entry={entry}
                lift={lift}
                attemptNumber={attemptNumber}
                attempt={attempt}
                onSetWeight={onSetWeight}
                onSetResult={onSetResult}
              />
            ) : (
              <span className="text-neutral-300">—</span>
            )}
          </td>
        );
      })}
      <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>{active && best > 0 ? best : '—'}</td>
    </>
  );
}

function PositionCard({ label, row, highlight }: { label: string; row: RunRow | null; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-md border-2 border-neutral-900 p-3' : 'rounded-md border border-neutral-200 p-3'}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      {row ? (
        <>
          <p className="mt-1 font-semibold text-neutral-900">{row.lifterName}</p>
          <p className="text-sm text-neutral-600">
            {row.weightKg} kg · {LIFT_LABELS[row.lift]} {row.attemptNumber} · {row.flightName}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-neutral-400">—</p>
      )}
    </div>
  );
}

// One attempt square: the weight is click-to-edit (any value, any time — the scorer is the
// authority; the server applies the progression guard). Once a weight exists, ✓ / ✗ toggle the
// result, and clicking the active one again reopens the attempt to pending for a correction.
function AttemptCell({
  entry,
  lift,
  attemptNumber,
  attempt,
  onSetWeight,
  onSetResult,
}: {
  entry: BoardEntry;
  lift: LiftType;
  attemptNumber: number;
  attempt: BoardAttempt | undefined;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const declaredAttempt = attempt && attempt.weightKg !== null ? attempt : null;

  const startEdit = () => {
    setDraft(declaredAttempt ? String(declaredAttempt.weightKg) : '');
    setEditing(true);
  };
  const submit = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value > 0) {
      onSetWeight(entry, lift, attemptNumber, value);
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {editing ? (
        <input
          autoFocus
          aria-label={`Weight for ${entry.lifterName}, ${LIFT_LABELS[lift]} attempt ${attemptNumber}`}
          type="number"
          inputMode="decimal"
          step="0.5"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submit();
            } else if (event.key === 'Escape') {
              setEditing(false);
            }
          }}
          className={CELL_INPUT}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Set weight for ${entry.lifterName}, ${LIFT_LABELS[lift]} attempt ${attemptNumber}`}
          className={declaredAttempt ? 'font-semibold tabular-nums text-neutral-900' : 'tabular-nums text-neutral-400'}
        >
          {declaredAttempt ? declaredAttempt.weightKg : '–'}
        </button>
      )}
      {declaredAttempt ? (
        <div className="flex justify-center gap-1">
          {/* Disabled until the optimistic weight write returns a real id — otherwise a result write
              would be sent with the temp placeholder id and rejected. */}
          <button
            type="button"
            disabled={declaredAttempt.id.startsWith(TEMP_ID_PREFIX)}
            aria-label={`Good lift for ${entry.lifterName}`}
            aria-pressed={declaredAttempt.result === 'good_lift'}
            onClick={() => onSetResult(declaredAttempt, declaredAttempt.result === 'good_lift' ? 'pending' : 'good_lift')}
            className={
              declaredAttempt.result === 'good_lift'
                ? 'rounded bg-green-600 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-50'
                : 'rounded border border-green-500 px-2 py-0.5 text-xs font-bold text-green-700 hover:bg-green-50 disabled:opacity-50'
            }
          >
            ✓
          </button>
          <button
            type="button"
            disabled={declaredAttempt.id.startsWith(TEMP_ID_PREFIX)}
            aria-label={`No lift for ${entry.lifterName}`}
            aria-pressed={declaredAttempt.result === 'no_lift'}
            onClick={() => onSetResult(declaredAttempt, declaredAttempt.result === 'no_lift' ? 'pending' : 'no_lift')}
            className={
              declaredAttempt.result === 'no_lift'
                ? 'rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-50'
                : 'rounded border border-red-500 px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50'
            }
          >
            ✗
          </button>
        </div>
      ) : null}
    </div>
  );
}
