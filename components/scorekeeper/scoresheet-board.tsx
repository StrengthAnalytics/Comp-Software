'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  ATTEMPTS_PER_LIFT,
  BENCH_SPOTTING_LABELS,
  BENCH_SPOTTINGS,
  LIFT_LABELS,
  SQUAT_RACK_SETTING_LABELS,
  SQUAT_RACK_SETTINGS,
  type BenchSpotting,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { bestGoodLift } from '@/lib/attempts/best-lift';
import { nextAttemptCountdown, type NextAttemptCountdown } from '@/lib/attempts/auto-progression';
import { ipfGlPoints, type KitType, type Sex } from '@/lib/scoring/ipf-gl';
import {
  orderSessionRoster,
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import { useFlightsSubscription } from '@/lib/realtime/use-flights-subscription';
import { setAttemptResultAction, setAttemptWeightAction } from '@/actions/attempts';
import { updateEntryRackSettingsAction } from '@/actions/entries';
import { OptionalSelectField } from '@/components/optional-select-field';
import { parseOptionalNumber } from '@/lib/number-input';
import { usePersistentString } from '@/lib/use-persistent-string';
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
  sex: Sex;
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
  // When the result was set to a good/no lift, anchoring the next attempt's 60-second countdown.
  decidedAt: string | null;
};

type ScoresheetBoardProps = {
  competitionId: string;
  isTeamCompetition: boolean;
  kitType: KitType;
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
// Zebra band for alternate roster rows. Single-sourced so the row and its sticky first column (which
// needs its own opaque background) can never drift to different shades.
const ROW_BAND = 'bg-neutral-50';
// Gridlines use a border-separate model — right+bottom on every cell, top on the header row, left on
// the frozen first column — so the bold lines stay attached to the sticky header and frozen column when
// the table scrolls. (With border-collapse the collapsed borders are owned by the table and drop off
// the sticky cells on scroll.)
const HEAD = 'border-b-[1.5px] border-r-[1.5px] border-t-[1.5px] border-black bg-neutral-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600';
const CELL = 'border-b-[1.5px] border-r-[1.5px] border-black px-2 py-1 align-middle';
// Attempt cells drop their inner padding so the weight button can fill the whole square as one large
// touch target; the button carries its own padding.
const CELL_ATTEMPT = 'border-b-[1.5px] border-r-[1.5px] border-black p-1 align-middle';
const CELL_INPUT = 'min-h-[2.75rem] w-full rounded border border-neutral-500 px-1 text-center text-base tabular-nums text-neutral-900 focus:outline-none';

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

// Only squat and bench have rack settings; deadlift has none. A type guard so the rack cell narrows
// the lift to the two rack disciplines.
function liftHasRack(lift: LiftType): lift is 'squat' | 'bench' {
  return lift === 'squat' || lift === 'bench';
}

// A single lift's rack edit, applied optimistically to the entry and sent to updateEntryRackSettingsAction.
type RackPatch =
  | { lift: 'squat'; rackHeightSquat: number | null; squatRackSetting: SquatRackSetting | null }
  | {
      lift: 'bench';
      rackHeightBench: number | null;
      benchSafetyHeight: number | null;
      benchSpotting: BenchSpotting | null;
    };

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
    decidedAt: row.decided_at,
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
  sexById: Map<string, Sex>,
  classNameById: Map<string, string>,
  divisionNameById: Map<string, string>,
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

    // Rows follow the running order of the round in progress (lightest bar first), re-sorting as each
    // round, lift and flight advances — rather than a static flight-then-lot scoresheet.
    const roster = orderSessionRoster(
      (rosterBySession.get(liveSession.id) ?? []).map((item) => ({
        entryId: item.entry.id,
        flightId: item.flight.id,
        flightSortOrder: item.flight.sortOrder,
        lotNumber: item.entry.lotNumber,
        entry: item.entry,
        flightName: item.flight.name,
      })),
      rowsBySession.get(liveSession.id) ?? [],
    ).map(({ entry, flightName }) => ({ entry, flightName }));

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
  kitType,
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
  // Default to the full-window view: the admin chrome caps content at max-w-6xl minus the comp-nav
  // sidebar (~840px), which crushes the wide scoresheet. Full screen reclaims the whole window; Esc or
  // Collapse drops back to the in-flow view (which now scrolls horizontally rather than compressing).
  const [expanded, setExpanded] = useState(true);
  // View options, toggled from the Options dropdown and remembered per browser. Striping defaults on;
  // the IPF GL column defaults off (it is an extra column most operators won't want by default).
  const [stripingPref, setStripingPref] = usePersistentString('scoresheet:striping', 'on');
  const striped = stripingPref !== 'off';
  const [glPref, setGlPref] = usePersistentString('scoresheet:gl', 'off');
  const showGl = glPref === 'on';
  const [, startTransition] = useTransition();

  const nameById = useMemo(
    () => new Map(initialEntries.map((entry) => [entry.id, entry.lifterName])),
    [initialEntries],
  );
  const sexById = useMemo(
    () => new Map(initialEntries.map((entry) => [entry.id, entry.sex])),
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
    setEntries((current) => applyEntryChange(current, payload, nameById, sexById, classNameById, divisionNameById));
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
        decidedAt: previous?.decidedAt ?? null,
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

  // Updates a lifter's rack settings for one lift, optimistically. The rack columns live on the entry,
  // so this edits local entries state first, then persists; the entries subscription reconciles on
  // success (and on other devices). On failure the previous entry is restored and a toast shown.
  function setRackSettings(entry: BoardEntry, patch: RackPatch) {
    const previous = entry;
    setError(null);
    setEntries((current) =>
      current.map((row) => {
        if (row.id !== entry.id) {
          return row;
        }
        return patch.lift === 'squat'
          ? { ...row, rackHeightSquat: patch.rackHeightSquat, squatRackSetting: patch.squatRackSetting }
          : {
              ...row,
              rackHeightBench: patch.rackHeightBench,
              benchSafetyHeight: patch.benchSafetyHeight,
              benchSpotting: patch.benchSpotting,
            };
      }),
    );
    startTransition(async () => {
      // RackPatch is exactly the action payload minus the ids, so it spreads straight in — no per-lift
      // branch needed here (the optimistic merge above still branches, to map onto BoardEntry's fields).
      const result = await updateEntryRackSettingsAction({ entryId: entry.id, competitionId, ...patch });
      if (result.status === 'error') {
        setEntries((current) => current.map((row) => (row.id === previous.id ? previous : row)));
        setError(readError(result));
      }
    });
  }

  function setResult(attempt: BoardAttempt, result: AttemptResult) {
    const key = attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber);
    // Mirror the server's decided_at stamp optimistically so the next attempt's countdown starts on
    // click rather than waiting for the realtime round-trip; the subscription reconciles the exact
    // server time (a sub-second shift). Clearing it on a non-decision cancels the countdown.
    const decidedAt = result === 'good_lift' || result === 'no_lift' ? new Date().toISOString() : null;
    setError(null);
    setAttempts((current) => {
      const existing = current.get(key);
      if (!existing) {
        return current;
      }
      const next = new Map(current);
      next.set(key, { ...existing, result, decidedAt });
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
          next.set(key, { ...existing, result: attempt.result, decidedAt: attempt.decidedAt });
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
        <div className="flex items-center gap-2">
          <BoardOptions
            toggles={[
              {
                id: 'striping',
                label: 'Row striping',
                checked: striped,
                onToggle: () => setStripingPref(striped ? 'off' : 'on'),
              },
              {
                id: 'gl',
                label: 'IPF GL points',
                checked: showGl,
                onToggle: () => setGlPref(showGl ? 'off' : 'on'),
              },
            ]}
          />
          <button type="button" onClick={() => setExpanded((value) => !value)} className={GHOST_BUTTON}>
            {expanded ? 'Collapse (Esc)' : 'Expand to full screen'}
          </button>
        </div>
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
              kitType={kitType}
              striped={striped}
              showGl={showGl}
              onSetWeight={setWeight}
              onSetResult={setResult}
              onSetRack={setRackSettings}
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

// A view-option toggle shown in the Options dropdown.
type BoardOptionToggle = { id: string; label: string; checked: boolean; onToggle: () => void };

// A small dropdown beside the Collapse button holding scoresheet view options (row striping, IPF GL
// column). The trigger toggles it; clicking outside or pressing Escape closes it.
function BoardOptions({ toggles }: { toggles: BoardOptionToggle[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      // event.target is typed EventTarget | null; a pointerdown always originates from a DOM Node,
      // so the cast is safe and Node.contains accepts it.
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    // Escape closes the menu. Listen in the capture phase and stop propagation so it beats the
    // board's own keydown handler (which would otherwise collapse the whole full-screen view).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    globalThis.addEventListener('pointerdown', onPointerDown);
    globalThis.addEventListener('keydown', onKeyDown, true);
    return () => {
      globalThis.removeEventListener('pointerdown', onPointerDown);
      globalThis.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        className={GHOST_BUTTON}
      >
        Options ▾
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
          {toggles.map((toggle) => (
            <label
              key={toggle.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              <span>{toggle.label}</span>
              <input
                type="checkbox"
                checked={toggle.checked}
                onChange={toggle.onToggle}
                className="h-4 w-4 accent-neutral-800"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlatformPanel({
  view,
  attempts,
  columnLifts,
  isTeamCompetition,
  kitType,
  striped,
  showGl,
  onSetWeight,
  onSetResult,
  onSetRack,
}: {
  view: PlatformView;
  attempts: Map<string, BoardAttempt>;
  columnLifts: LiftType[];
  isTeamCompetition: boolean;
  kitType: KitType;
  striped: boolean;
  showGl: boolean;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
  onSetRack: (entry: BoardEntry, patch: RackPatch) => void;
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
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={`sticky left-0 z-30 min-w-[11rem] border-l-[1.5px] text-left ${HEAD}`}>
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
                {showGl ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    IPF GL
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {roster.map(({ entry, flightName }, index) => {
                const total = entryTotal(entry);
                // IPF GL from the lifter's current total (sum of best lifts) and weigh-in bodyweight.
                // ipfGlPoints returns 0 with no good lifts or before weigh-in, which renders as a dash.
                const gl = showGl
                  ? ipfGlPoints({ sex: entry.sex, kitType, bodyweightKg: entry.bodyweightKg ?? 0, liftedKg: total })
                  : 0;
                // Band alternate rows when striping is on. The transparent cells show the row tint;
                // the sticky first column needs its own opaque background, so it carries the same
                // band (and stays white otherwise, to mask content scrolling beneath it).
                const banded = striped && index % 2 === 1;
                return (
                  <tr key={entry.id} className={banded ? ROW_BAND : ''}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap border-l-[1.5px] ${banded ? ROW_BAND : 'bg-white'} ${CELL}`}>
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
                        onSetRack={onSetRack}
                      />
                    );
                  })}
                  <td className={`text-center font-semibold tabular-nums text-neutral-900 ${CELL}`}>
                    {total > 0 ? total : '—'}
                  </td>
                  {showGl ? (
                    <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                      {gl > 0 ? gl.toFixed(2) : '—'}
                    </td>
                  ) : null}
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
  onSetRack,
}: {
  lift: LiftType;
  entry: BoardEntry;
  active: boolean;
  best: number;
  attempts: Map<string, BoardAttempt>;
  current: RunRow | null;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
  onSetRack: (entry: BoardEntry, patch: RackPatch) => void;
}) {
  return (
    <>
      {liftHasRack(lift) ? (
        <td className={`text-center text-xs text-neutral-500 ${CELL}`}>
          {active ? (
            <RackCell entry={entry} lift={lift} onSetRack={onSetRack} />
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </td>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => {
        const attempt = attempts.get(attemptKey(entry.id, lift, attemptNumber));
        const isCurrent =
          current?.entryId === entry.id && current.lift === lift && current.attemptNumber === attemptNumber;
        // The previous attempt of this lift drives the next attempt's countdown: once it is decided
        // and this cell is still undeclared, this cell counts down 60s and turns amber.
        const previous =
          attemptNumber > 1 ? attempts.get(attemptKey(entry.id, lift, attemptNumber - 1)) : undefined;
        const countdown = active ? nextAttemptCountdown(previous, attempt) : null;
        return (
          <td
            key={`${entry.id}-${lift}-${attemptNumber}`}
            className={`text-center ${CELL_ATTEMPT} ${active ? (countdown ? 'bg-amber-200' : cellTint(attempt, isCurrent)) : ''}`}
          >
            {active ? (
              <AttemptCell
                entry={entry}
                lift={lift}
                attemptNumber={attemptNumber}
                attempt={attempt}
                countdown={countdown}
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
// result, and clicking the active one again reopens the attempt to pending for a correction. While
// undeclared and the previous attempt is freshly decided, the cell shows the 60-second next-attempt
// countdown (amber, click to enter the weight); at zero it auto-commits the IPF default.
function AttemptCell({
  entry,
  lift,
  attemptNumber,
  attempt,
  countdown,
  onSetWeight,
  onSetResult,
}: {
  entry: BoardEntry;
  lift: LiftType;
  attemptNumber: number;
  attempt: BoardAttempt | undefined;
  countdown: NextAttemptCountdown | null;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // A 1 Hz tick that re-renders the cell while it counts down. The seconds left are derived from the
  // deadline in render (not stored as separate state), so the amber background and the number always
  // agree — no first-frame flash where the cell is amber but still shows the old value.
  const [, setTick] = useState(0);

  const declaredAttempt = attempt && attempt.weightKg !== null ? attempt : null;

  // The countdown is active only while there is one AND the operator is not editing this cell:
  // clicking the cell to enter the next attempt opens the editor and pauses the clock, so the
  // auto-commit can't fire underneath an in-progress edit. Seconds left clamp at zero.
  const active = countdown !== null && !editing;
  const remaining = active ? Math.max(0, Math.ceil((countdown.deadlineMs - Date.now()) / 1000)) : null;
  const countingDown = remaining !== null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = globalThis.setInterval(() => setTick((value) => value + 1), 1000);
    return () => globalThis.clearInterval(id);
  }, [active]);

  // Auto-commit the IPF default once the clock expires. It fires through the normal optimistic path:
  // onSetWeight sets the weight, which clears the countdown and stops this from running again. If the
  // write fails and the weight rolls back, the countdown reappears and this retries on the next tick
  // (self-healing) — rather than latching a one-shot flag that would leave the cell stuck at 0.
  const autoCommitRef = useRef<() => void>(() => {});
  autoCommitRef.current = () => {
    if (countdown) {
      onSetWeight(entry, lift, attemptNumber, countdown.autoWeight);
    }
  };
  useEffect(() => {
    if (active && remaining === 0) {
      autoCommitRef.current();
    }
  }, [active, remaining]);

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
    <div className="flex h-full flex-col gap-1">
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
        // The weight fills the whole cell so tapping anywhere in the square opens the editor. While
        // counting down it shows the seconds left; clicking still opens the weight editor.
        <button
          type="button"
          onClick={startEdit}
          aria-label={
            countingDown
              ? `Enter next attempt for ${entry.lifterName}, ${LIFT_LABELS[lift]} attempt ${attemptNumber}; ${remaining}s left`
              : `Set weight for ${entry.lifterName}, ${LIFT_LABELS[lift]} attempt ${attemptNumber}`
          }
          className={`flex min-h-[2.75rem] w-full flex-1 items-center justify-center rounded tabular-nums hover:bg-black/5 ${countingDown ? 'text-lg font-bold text-amber-900' : `text-base ${declaredAttempt ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}`}
        >
          {countingDown ? remaining : (declaredAttempt ? declaredAttempt.weightKg : '–')}
        </button>
      )}
      {declaredAttempt ? (
        <div className="flex justify-center gap-1.5">
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
                ? 'rounded bg-green-600 px-3 py-1 text-sm font-bold text-white disabled:opacity-50'
                : 'rounded border border-green-500 px-3 py-1 text-sm font-bold text-green-700 hover:bg-green-50 disabled:opacity-50'
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
                ? 'rounded bg-red-600 px-3 py-1 text-sm font-bold text-white disabled:opacity-50'
                : 'rounded border border-red-500 px-3 py-1 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50'
            }
          >
            ✗
          </button>
        </div>
      ) : null}
    </div>
  );
}

const RACK_FIELD_INPUT =
  'w-full rounded border border-neutral-400 px-1 py-1 text-sm tabular-nums text-neutral-900 focus:outline-none';
const RACK_FIELD_SELECT = 'w-full rounded border border-neutral-400 px-1 py-1 text-sm text-neutral-900 focus:outline-none';
const RACK_FIELD_LABEL = 'text-[10px] font-medium uppercase tracking-wide text-neutral-500';

// The rack column for squat and bench: shows the current settings and is click-to-edit so the head
// table can adjust a lifter's rack height and setting (squat) or rack/safety height and spotting
// (bench) live on the scoresheet. Edits are optimistic; the entries subscription reconciles.
function RackCell({
  entry,
  lift,
  onSetRack,
}: {
  entry: BoardEntry;
  lift: 'squat' | 'bench';
  onSetRack: (entry: BoardEntry, patch: RackPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [height, setHeight] = useState('');
  const [squatSetting, setSquatSetting] = useState<SquatRackSetting | ''>('');
  const [safety, setSafety] = useState('');
  const [spotting, setSpotting] = useState<BenchSpotting | ''>('');

  // Seed the drafts from the entry each time the editor opens, so it always reflects current settings.
  const openEditor = () => {
    if (lift === 'squat') {
      setHeight(entry.rackHeightSquat === null ? '' : String(entry.rackHeightSquat));
      setSquatSetting(entry.squatRackSetting ?? '');
    } else {
      setHeight(entry.rackHeightBench === null ? '' : String(entry.rackHeightBench));
      setSafety(entry.benchSafetyHeight === null ? '' : String(entry.benchSafetyHeight));
      setSpotting(entry.benchSpotting ?? '');
    }
    setEditing(true);
  };

  const submit = () => {
    if (lift === 'squat') {
      onSetRack(entry, {
        lift: 'squat',
        rackHeightSquat: parseOptionalNumber(height),
        squatRackSetting: squatSetting === '' ? null : squatSetting,
      });
    } else {
      onSetRack(entry, {
        lift: 'bench',
        rackHeightBench: parseOptionalNumber(height),
        benchSafetyHeight: parseOptionalNumber(safety),
        benchSpotting: spotting === '' ? null : spotting,
      });
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={openEditor}
        aria-label={`Edit ${LIFT_LABELS[lift]} rack settings for ${entry.lifterName}`}
        className="flex min-h-[2.75rem] w-full items-center justify-center whitespace-nowrap rounded px-1 hover:bg-black/5"
      >
        {rackText(entry, lift)}
      </button>
    );
  }

  return (
    <div className="flex w-36 flex-col gap-1.5 text-left">
      <label className="flex flex-col gap-0.5">
        <span className={RACK_FIELD_LABEL}>{lift === 'squat' ? 'Rack height' : 'Bench height'}</span>
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          step="1"
          value={height}
          onChange={(event) => setHeight(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submit();
            } else if (event.key === 'Escape') {
              setEditing(false);
            }
          }}
          className={RACK_FIELD_INPUT}
        />
      </label>
      {lift === 'squat' ? (
        <OptionalSelectField
          label="Setting"
          value={squatSetting}
          onChange={setSquatSetting}
          options={SQUAT_RACK_SETTINGS}
          labels={SQUAT_RACK_SETTING_LABELS}
          wrapperClassName="flex flex-col gap-0.5"
          labelClassName={RACK_FIELD_LABEL}
          selectClassName={RACK_FIELD_SELECT}
        />
      ) : (
        <>
          <label className="flex flex-col gap-0.5">
            <span className={RACK_FIELD_LABEL}>Safety height</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              value={safety}
              onChange={(event) => setSafety(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submit();
                } else if (event.key === 'Escape') {
                  setEditing(false);
                }
              }}
              className={RACK_FIELD_INPUT}
            />
          </label>
          <OptionalSelectField
            label="Spotting"
            value={spotting}
            onChange={setSpotting}
            options={BENCH_SPOTTINGS}
            labels={BENCH_SPOTTING_LABELS}
            wrapperClassName="flex flex-col gap-0.5"
            labelClassName={RACK_FIELD_LABEL}
            selectClassName={RACK_FIELD_SELECT}
          />
        </>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={submit}
          className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
