'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { nextAttemptCountdown, type NextAttemptCountdown } from '@/lib/attempts/auto-progression';
import type { KitType } from '@/lib/scoring/ipf-gl';
import {
  selectLiveSession,
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { orderRosterForSession } from '@/lib/scorekeeper/order-roster';
import { bestLiftFor, computeEntryScore, computePredictedScore, type PredictedScore } from '@/lib/scorekeeper/entry-score';
import { computePlacings, type PlaceableEntry } from '@/lib/scorekeeper/placings';
import { computeBoardTeamStandings } from '@/lib/scorekeeper/team-board-standings';
import type { TeamStanding } from '@/lib/scoring/team-standings';
import { attemptKey, useBoardState } from '@/lib/realtime/use-board-state';
import { computeConnectionIndicator } from '@/lib/realtime/connection-status';
import { loadOutbox, saveOutbox, type PendingOp, type RackPatch } from '@/lib/scorekeeper/outbox';
import { cellTint, liftHasRack, rackText } from '@/lib/scorekeeper/board-format';
import { BoardOptions } from '@/components/scorekeeper/board-options';
import type {
  BoardAttempt,
  BoardEntry,
  BoardFlight,
  BoardPlatform,
  BoardSession,
  NamedOption,
} from '@/lib/scorekeeper/board-types';
import { setAttemptResultAction, setAttemptWeightAction } from '@/actions/attempts';
import { updateEntryRackSettingsAction } from '@/actions/entries';
import { OptionalSelectField } from '@/components/optional-select-field';
import { SAVE_RETRY_MS } from '@/components/station/save-state';
import { parseOptionalNumber } from '@/lib/number-input';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { useOnline } from '@/lib/use-online';
import type { ActionResult } from '@/types/action-result';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

type ScoresheetBoardProps = {
  competitionId: string;
  isTeamCompetition: boolean;
  kitType: KitType;
  lifts: Lifts;
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  weightClasses: NamedOption[];
  ageCategories: NamedOption[];
  teams: NamedOption[];
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
  isTeamCompetition,
}: {
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: Map<string, BoardAttempt>;
  isTeamCompetition: boolean;
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
    const liveSession = selectLiveSession(platformSessions, attemptCountBySession, pendingCountBySession);
    if (!liveSession) {
      continue;
    }

    // Rows follow the running order of the round in progress (lightest bar first), re-sorting as each
    // round, lift and flight advances — rather than a static flight-then-lot scoresheet. A team comp
    // groups by lift across the whole session (each member contests one assigned lift) instead of by
    // the flight's single current lift.
    const roster = orderRosterForSession(
      rosterBySession.get(liveSession.id) ?? [],
      rowsBySession.get(liveSession.id) ?? [],
      isTeamCompetition,
    );

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
  ageCategories,
  teams,
  entries: initialEntries,
  attempts: initialAttempts,
}: ScoresheetBoardProps) {
  const { attempts, setAttempts, entries, setEntries, flights, connection } = useBoardState({
    competitionId,
    initialAttempts,
    initialEntries,
    initialFlights,
    weightClasses,
    ageCategories,
    teams,
  });
  const [error, setError] = useState<string | null>(null);
  // Default to the full-window view: the admin chrome caps content at max-w-6xl minus the comp-nav
  // sidebar (~840px), which crushes the wide scoresheet. Full screen reclaims the whole window; Esc or
  // Collapse drops back to the in-flow view (which now scrolls horizontally rather than compressing).
  const [expanded, setExpanded] = useState(true);
  // View options, toggled from the Options dropdown and remembered per browser (so two operators — or a
  // scorer and a mirrored display — can show different cuts of the same comp). The lifter and attempt
  // columns are always shown; everything else is optional. The structural columns default on (the full
  // sheet); the sub-total and IPF GL columns are extras, so they default off.
  const [teamPref, toggleTeam] = usePersistentToggle('scoresheet:col:team');
  const [showLot, toggleLot] = usePersistentToggle('scoresheet:col:lot');
  const [showBw, toggleBw] = usePersistentToggle('scoresheet:col:bw');
  const [showClass, toggleClass] = usePersistentToggle('scoresheet:col:class');
  const [showAgeCat, toggleAgeCat] = usePersistentToggle('scoresheet:col:agecat');
  const [showDivision, toggleDivision] = usePersistentToggle('scoresheet:col:division', false);
  const [showRack, toggleRack] = usePersistentToggle('scoresheet:col:rack');
  const [showBest, toggleBest] = usePersistentToggle('scoresheet:col:best');
  const [showTotal, toggleTotal] = usePersistentToggle('scoresheet:col:total');
  const [subTotalPref, toggleSubTotal] = usePersistentToggle('scoresheet:col:subtotal', false);
  const [showGl, toggleGl] = usePersistentToggle('scoresheet:gl', false);
  // Standings columns — current/predicted place and the predicted total/GL (individual comps), or the
  // team's actual/predicted points (team comps). All extras, so they default off.
  const [curPlacePref, toggleCurPlace] = usePersistentToggle('scoresheet:col:curplace', false);
  const [predPlacePref, togglePredPlace] = usePersistentToggle('scoresheet:col:predplace', false);
  const [predTotalPref, togglePredTotal] = usePersistentToggle('scoresheet:col:predtotal', false);
  const [predGlPref, togglePredGl] = usePersistentToggle('scoresheet:col:predgl', false);
  const [teamActualPref, toggleTeamActual] = usePersistentToggle('scoresheet:col:teamactual', false);
  const [teamPredPref, toggleTeamPred] = usePersistentToggle('scoresheet:col:teampred', false);
  const [striped, toggleStriping] = usePersistentToggle('scoresheet:striping');

  // Browser connectivity, for gating and flushing the offline outbox. (The realtime channel health in
  // `connection` drives the indicator colour; this boolean is the HTTP-availability signal the server
  // actions need.)
  const online = useOnline();
  // The offline outbox: edits made while the action can't reach the server are held here and replayed
  // on reconnect, so the run screen — the source of truth every other screen reads — never loses an
  // operator's input and never blanks on a failed save. The Map (cell+field → latest op) is the source
  // of truth and is mutated in place inside async flushes; pendingCount mirrors its size for rendering.
  const pendingOpsRef = useRef<Map<string, PendingOp>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a queued op is rejected deterministically by the server (e.g. the progression guard). The
  // optimistic state still shows the refused value, so once the queue has drained we re-pull the
  // authoritative server snapshot to converge — see flush().
  const needsReconcileRef = useRef(false);
  const router = useRouter();
  // The flush is recreated each render (closing over the latest state setters); a ref lets the effects
  // and handlers call the current one without re-subscribing, mirroring the realtime callback pattern.
  const flushRef = useRef<() => void>(() => {});
  // Same ref pattern for the deferred reconcile, so the reconnect effect can run it without depending
  // on every render's closure.
  const maybeReconcileRef = useRef<() => void>(() => {});

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

  // The sub-total (best squat + best bench) only means anything when both lifts are contested by the
  // same lifter, so the option is offered only then and the column is shown after the bench's Best
  // column. Excluded for team comps, where each member contests a single assigned lift — a squat-only
  // member has no bench to combine, so an "S+B" column would just relabel their one lift.
  const canSubTotal =
    !isTeamCompetition && columnLifts.includes('squat') && columnLifts.includes('bench');
  const showSubTotal = canSubTotal && subTotalPref;

  // The team column only applies to team comps (the lifter's team sits right after their name); the
  // toggle is offered only then and defaults on.
  const showTeam = isTeamCompetition && teamPref;

  const views = useMemo(
    () => buildPlatformViews({ platforms, sessions, flights, entries, attempts, isTeamCompetition }),
    [platforms, sessions, flights, entries, attempts, isTeamCompetition],
  );

  // Place columns apply to both comp types — but in a team comp the place is the lifter's team's
  // place, not an individual one. The predicted total/GL columns are individual-only; the team-points
  // columns are team-only. Each is gated on its toggle so the comp-wide work below only runs when
  // something needs it.
  const showCurPlace = curPlacePref;
  const showPredPlace = predPlacePref;
  const showPredTotal = !isTeamCompetition && predTotalPref;
  const showPredGl = !isTeamCompetition && predGlPref;
  const showTeamActual = isTeamCompetition && teamActualPref;
  const showTeamPred = isTeamCompetition && teamPredPref;

  // Each individual lifter's running total and projected score, computed comp-wide (across every
  // flight/session, not just the platform on screen) so the places below rank the whole field. Built
  // once and reused by the predicted columns; empty for a team comp or unless one of those columns is on.
  const individualScores = useMemo(() => {
    const map = new Map<string, { currentTotal: number; predicted: PredictedScore }>();
    if (isTeamCompetition || (!showCurPlace && !showPredPlace && !showPredTotal && !showPredGl)) {
      return map;
    }
    for (const entry of entries) {
      map.set(entry.id, {
        currentTotal: computeEntryScore(attempts, entry, columnLifts, kitType, false).total,
        predicted: computePredictedScore(attempts, entry, columnLifts, kitType, false),
      });
    }
    return map;
  }, [entries, attempts, columnLifts, kitType, isTeamCompetition, showCurPlace, showPredPlace, showPredTotal, showPredGl]);

  // Individual current/predicted place per entry, within (weight class × age category × sex). Empty for
  // a team comp (which ranks teams, not lifters) or unless a place column is on.
  const placings = useMemo(() => {
    if (isTeamCompetition || (!showCurPlace && !showPredPlace)) {
      return { currentPlaceById: new Map<string, number>(), predictedPlaceById: new Map<string, number>() };
    }
    const placeable: PlaceableEntry[] = entries.map((entry) => {
      const score = individualScores.get(entry.id);
      return {
        id: entry.id,
        weightClassId: entry.weightClassId,
        ageCategoryId: entry.ageCategoryId,
        sex: entry.sex,
        bodyweightKg: entry.bodyweightKg,
        lotNumber: entry.lotNumber,
        currentTotal: score?.currentTotal ?? 0,
        predictedTotal: score?.predicted.predictedTotal ?? 0,
      };
    });
    return computePlacings(placeable);
  }, [entries, individualScores, isTeamCompetition, showCurPlace, showPredPlace]);

  // Full team standings (actual + predicted points and ranks) keyed by team id, via the shared scorer
  // the public results page uses. Empty for an individual comp or unless a team column is on.
  const teamStandings = useMemo(() => {
    if (!isTeamCompetition || (!showCurPlace && !showPredPlace && !showTeamActual && !showTeamPred)) {
      return new Map<string, TeamStanding>();
    }
    return computeBoardTeamStandings(attempts, entries, kitType);
  }, [attempts, entries, kitType, isTeamCompetition, showCurPlace, showPredPlace, showTeamActual, showTeamPred]);

  // Mirror the outbox to localStorage so edits queued in this session survive a page reload — e.g. the
  // operator reloads, or the tab is reopened, while still offline — and reach the database when the
  // connection returns rather than being lost with the in-memory queue.
  function persistOutbox() {
    saveOutbox(competitionId, pendingOpsRef.current);
  }

  // Queue (or supersede) one outbox op and kick a flush. The optimistic state has already been applied
  // by the caller; this only schedules and persists the write.
  function enqueue(key: string, op: PendingOp) {
    pendingOpsRef.current.set(key, op);
    setPendingCount(pendingOpsRef.current.size);
    persistOutbox();
    flushRef.current();
  }

  function dropPending(key: string) {
    pendingOpsRef.current.delete(key);
    setPendingCount(pendingOpsRef.current.size);
    persistOutbox();
  }

  // Retire a queued op once its send has been handled — but only if the operator hasn't re-edited the
  // same cell during the round-trip. If a newer op now sits under the same key, dropping it would
  // discard that edit (the board would keep the new value while the server kept the old). Leaving the
  // newer op queued lets the follow-up drain send it. Returns whether the op was actually removed.
  function retire(key: string, op: PendingOp): boolean {
    if (pendingOpsRef.current.get(key) !== op) {
      return false;
    }
    dropPending(key);
    return true;
  }

  // Sends one op to its server action and reconciles local state on success (adopting the real id for a
  // freshly-created attempt). Returns the action result; throws only on a transport failure (offline /
  // server unreachable), which the flush loop catches.
  async function sendOp(op: PendingOp): Promise<ActionResult<unknown>> {
    if (op.kind === 'weight') {
      const result = await setAttemptWeightAction({
        competitionId,
        entryId: op.entryId,
        lift: op.lift,
        attemptNumber: op.attemptNumber,
        weightKg: op.weightKg,
      });
      if (result.status === 'ok') {
        const key = attemptKey(op.entryId, op.lift, op.attemptNumber);
        setAttempts((current) => {
          const existing = current.get(key);
          if (!existing) {
            return current;
          }
          const next = new Map(current);
          next.set(key, { ...existing, id: result.data.id });
          return next;
        });
      }
      return result;
    }
    if (op.kind === 'result') {
      return setAttemptResultAction({
        competitionId,
        entryId: op.entryId,
        lift: op.lift,
        attemptNumber: op.attemptNumber,
        result: op.result,
        // Carry the operator's mark time so an offline good/no lift anchors its next-attempt
        // countdown to when it was marked, not to this (reconnect-time) flush.
        decidedAt: op.decidedAt,
      });
    }
    // RackPatch is exactly the action payload minus the ids, so it spreads straight in.
    return updateEntryRackSettingsAction({ entryId: op.entryId, competitionId, ...op.patch });
  }

  function scheduleRetry() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      flushRef.current();
    }, SAVE_RETRY_MS);
  }

  // Re-pull the authoritative server snapshot after a rejection left local state showing a value the
  // server refused, so the run screen (the source of truth every other screen reads) converges instead
  // of holding the rejected edit. Only fires when online and the queue has fully drained: a refresh
  // while offline would no-op and waste the flag, and refreshing with ops still queued could wipe
  // still-pending optimistic edits. The flag persists across an offline gap so the reconnect flush
  // can run it. Callable from the flush tail and the reconnect effect (the latter because flush
  // no-ops on an already-empty queue, so a reconnect with nothing queued would otherwise never
  // reconcile a rejection that was flagged while offline).
  function maybeReconcile() {
    const onlineNow = typeof navigator === 'undefined' || navigator.onLine;
    if (onlineNow && pendingOpsRef.current.size === 0 && needsReconcileRef.current) {
      needsReconcileRef.current = false;
      router.refresh();
    }
  }
  maybeReconcileRef.current = maybeReconcile;

  // Drains the outbox: weights first, then racks, then results, so an attempt created offline exists
  // before its result is replayed. A transport failure (still offline / server down) stops the drain
  // and leaves the rest queued; a deterministic rejection (e.g. the progression guard) drops that op,
  // surfaces the message, and — because the optimistic state still shows the refused value — flags a
  // reconcile so the board re-pulls server truth once the queue has fully drained. One flush runs at a
  // time; ops that arrive mid-flush are picked up by a follow-up drain, and a transient failure
  // schedules a retry so a passing blip self-heals.
  async function flush() {
    if (flushingRef.current) {
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    if (pendingOpsRef.current.size === 0) {
      return;
    }
    flushingRef.current = true;
    // Whether this drain handled at least one op (sent or skipped) or left a superseded op behind —
    // either way there may be more to do, so a follow-up drain is scheduled below.
    let progressed = false;
    let transportFailed = false;
    try {
      const queued = [...pendingOpsRef.current.entries()];
      const ordered = [
        ...queued.filter(([, op]) => op.kind === 'weight'),
        ...queued.filter(([, op]) => op.kind === 'rack'),
        ...queued.filter(([, op]) => op.kind === 'result'),
      ];
      // Cells whose weight op was rejected this drain. Since weights are ordered before results, a
      // result for such a cell can be skipped: its attempt was never created, so the send would only
      // fail with a confusing "declare a weight" message. Drop it and let the reconcile re-pull truth.
      const rejectedWeightCells = new Set<string>();
      for (const [key, op] of ordered) {
        if (op.kind === 'result' && rejectedWeightCells.has(attemptKey(op.entryId, op.lift, op.attemptNumber))) {
          retire(key, op);
          progressed = true;
          continue;
        }
        let result: ActionResult<unknown>;
        try {
          result = await sendOp(op);
        } catch {
          // Transport failure: keep this and the remaining ops queued for the next flush/retry.
          transportFailed = true;
          break;
        }
        // Retire the op we just sent unless the operator re-edited this cell mid-send (retire leaves a
        // superseded op queued for the follow-up drain).
        retire(key, op);
        progressed = true;
        if (result.status === 'error') {
          setError(readError(result));
          needsReconcileRef.current = true;
          if (op.kind === 'weight') {
            rejectedWeightCells.add(attemptKey(op.entryId, op.lift, op.attemptNumber));
          }
        }
      }
    } finally {
      flushingRef.current = false;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Went offline mid-drain: leave whatever is left queued for the reconnect flush. Don't schedule
      // a retry or reconcile here — the reconnect effect drives both, and a router.refresh while
      // offline would no-op and waste the deferred reconcile.
      return;
    }
    if (pendingOpsRef.current.size > 0) {
      if (progressed) {
        // Ops arrived (or were superseded) while we were flushing — drain them too.
        void flush();
      } else if (transportFailed) {
        scheduleRetry();
      }
      return;
    }
    maybeReconcile();
  }
  flushRef.current = () => void flush();

  // Replay the outbox as soon as the browser reports it is back online. Also reconcile: a rejection
  // flagged while offline can't be re-pulled until reconnect, and flush no-ops on an already-empty
  // queue, so without this a reconnect with nothing queued would never converge that rejected edit.
  useEffect(() => {
    if (online) {
      flushRef.current();
      maybeReconcileRef.current();
    }
  }, [online]);
  // Tear down the retry timer on unmount.
  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    },
    [],
  );

  // On mount, restore any edits a previous session queued but couldn't sync (e.g. the page was reloaded
  // while offline). The ops are replayed into local state so the board shows the operator's un-synced
  // work — not just the server snapshot, which doesn't have it yet — and then flushed (immediately if
  // online, else on reconnect). Runs once; guarded so React StrictMode's double-mount can't double-apply.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    const stored = loadOutbox(competitionId);
    if (stored.size === 0) {
      return;
    }
    pendingOpsRef.current = stored;
    setPendingCount(stored.size);
    const ops = [...stored.values()];
    setAttempts((current) => {
      const next = new Map(current);
      // Weights first so a result replayed below lands on an attempt that exists in local state.
      for (const op of ops) {
        if (op.kind !== 'weight') {
          continue;
        }
        const key = attemptKey(op.entryId, op.lift, op.attemptNumber);
        const prev = next.get(key);
        next.set(key, {
          id: prev?.id ?? `${TEMP_ID_PREFIX}${key}`,
          entryId: op.entryId,
          lift: op.lift,
          attemptNumber: op.attemptNumber,
          weightKg: op.weightKg,
          result: prev?.result ?? 'pending',
          decidedAt: prev?.decidedAt ?? null,
        });
      }
      for (const op of ops) {
        if (op.kind !== 'result') {
          continue;
        }
        const key = attemptKey(op.entryId, op.lift, op.attemptNumber);
        const existing = next.get(key);
        if (!existing) {
          continue;
        }
        // Replay the original decision time so a good/no-lift's next-attempt countdown anchors to when
        // the operator actually marked it, not to this reload.
        next.set(key, { ...existing, result: op.result, decidedAt: op.decidedAt });
      }
      return next;
    });
    setEntries((current) =>
      current.map((row) => {
        let updated = row;
        for (const op of ops) {
          if (op.kind !== 'rack' || op.entryId !== row.id) {
            continue;
          }
          updated =
            op.patch.lift === 'squat'
              ? { ...updated, rackHeightSquat: op.patch.rackHeightSquat, squatRackSetting: op.patch.squatRackSetting }
              : {
                  ...updated,
                  rackHeightBench: op.patch.rackHeightBench,
                  benchSafetyHeight: op.patch.benchSafetyHeight,
                  benchSpotting: op.patch.benchSpotting,
                };
        }
        return updated;
      }),
    );
    flushRef.current();
  }, [competitionId]);

  // Sets (or creates) an attempt's weight, optimistically. The existing result is preserved so a
  // weight correction keeps a recorded good/no lift; the server enforces the progression guard. The
  // write goes through the outbox, so it persists immediately when online and is held + replayed when
  // not — the screen never blanks on a failed save.
  function setWeight(entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) {
    const key = attemptKey(entry.id, lift, attemptNumber);
    const previous = attempts.get(key);
    setError(null);
    setAttempts((current) => {
      const next = new Map(current);
      next.set(key, {
        id: previous?.id ?? `${TEMP_ID_PREFIX}${key}`,
        entryId: entry.id,
        lift,
        attemptNumber,
        weightKg,
        result: previous?.result ?? 'pending',
        decidedAt: previous?.decidedAt ?? null,
      });
      return next;
    });
    enqueue(`w:${key}`, { kind: 'weight', entryId: entry.id, lift, attemptNumber, weightKg });
  }

  // Updates a lifter's rack settings for one lift, optimistically (the rack columns live on the entry).
  function setRackSettings(entry: BoardEntry, patch: RackPatch) {
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
    enqueue(`k:${entry.id}:${patch.lift}`, { kind: 'rack', entryId: entry.id, patch });
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
    enqueue(`r:${key}`, {
      kind: 'result',
      entryId: attempt.entryId,
      lift: attempt.lift,
      attemptNumber: attempt.attemptNumber,
      result,
      decidedAt,
    });
  }

  const hasRoster = views.some((view) => view.roster.length > 0);
  const connectionIndicator = computeConnectionIndicator(connection, pendingCount);

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto bg-white p-4' : ''}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {expanded ? <h2 className="text-lg font-semibold text-neutral-900">Scoresheet</h2> : <span />}
        <div className="flex items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${connectionIndicator.box}`}
          >
            <span className={`h-2 w-2 rounded-full ${connectionIndicator.dot} ${connectionIndicator.pulse ? 'animate-pulse' : ''}`} />
            {connectionIndicator.text}
          </div>
          <BoardOptions
            toggles={[
              ...(isTeamCompetition
                ? [{ id: 'team', label: 'Team', checked: showTeam, onToggle: toggleTeam }]
                : []),
              { id: 'lot', label: 'Lot', checked: showLot, onToggle: toggleLot },
              { id: 'bw', label: 'Bodyweight', checked: showBw, onToggle: toggleBw },
              { id: 'class', label: 'Weight class', checked: showClass, onToggle: toggleClass },
              { id: 'agecat', label: 'Age category', checked: showAgeCat, onToggle: toggleAgeCat },
              { id: 'division', label: 'Division', checked: showDivision, onToggle: toggleDivision },
              { id: 'rack', label: 'Rack settings', checked: showRack, onToggle: toggleRack },
              { id: 'best', label: 'Best lift', checked: showBest, onToggle: toggleBest },
              ...(canSubTotal
                ? [{ id: 'subtotal', label: 'Sub-total (S+B)', checked: showSubTotal, onToggle: toggleSubTotal }]
                : []),
              { id: 'total', label: 'Total', checked: showTotal, onToggle: toggleTotal },
              { id: 'gl', label: 'IPF GL points', checked: showGl, onToggle: toggleGl },
              // Place columns show in both comp types (team place in a team comp); the points/total
              // columns are comp-specific.
              { id: 'curplace', label: 'Current place', checked: showCurPlace, onToggle: toggleCurPlace },
              { id: 'predplace', label: 'Predicted place', checked: showPredPlace, onToggle: togglePredPlace },
              ...(isTeamCompetition
                ? [
                    { id: 'teamactual', label: 'Team points', checked: showTeamActual, onToggle: toggleTeamActual },
                    { id: 'teampred', label: 'Predicted team points', checked: showTeamPred, onToggle: toggleTeamPred },
                  ]
                : [
                    { id: 'predtotal', label: 'Predicted total', checked: showPredTotal, onToggle: togglePredTotal },
                    { id: 'predgl', label: 'Predicted GL points', checked: showPredGl, onToggle: togglePredGl },
                  ]),
              { id: 'striping', label: 'Row striping', checked: striped, onToggle: toggleStriping },
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
              showTeam={showTeam}
              showLot={showLot}
              showBw={showBw}
              showClass={showClass}
              showAgeCat={showAgeCat}
              showDivision={showDivision}
              showRack={showRack}
              showBest={showBest}
              showTotal={showTotal}
              showSubTotal={showSubTotal}
              showCurPlace={showCurPlace}
              showPredPlace={showPredPlace}
              showPredTotal={showPredTotal}
              showPredGl={showPredGl}
              showTeamActual={showTeamActual}
              showTeamPred={showTeamPred}
              currentPlaceById={placings.currentPlaceById}
              predictedPlaceById={placings.predictedPlaceById}
              predictedScoreById={individualScores}
              teamStandingsById={teamStandings}
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

function PlatformPanel({
  view,
  attempts,
  columnLifts,
  isTeamCompetition,
  kitType,
  striped,
  showGl,
  showTeam,
  showLot,
  showBw,
  showClass,
  showAgeCat,
  showDivision,
  showRack,
  showBest,
  showTotal,
  showSubTotal,
  showCurPlace,
  showPredPlace,
  showPredTotal,
  showPredGl,
  showTeamActual,
  showTeamPred,
  currentPlaceById,
  predictedPlaceById,
  predictedScoreById,
  teamStandingsById,
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
  showTeam: boolean;
  showLot: boolean;
  showBw: boolean;
  showClass: boolean;
  showAgeCat: boolean;
  showDivision: boolean;
  showRack: boolean;
  showBest: boolean;
  showTotal: boolean;
  showSubTotal: boolean;
  showCurPlace: boolean;
  showPredPlace: boolean;
  showPredTotal: boolean;
  showPredGl: boolean;
  showTeamActual: boolean;
  showTeamPred: boolean;
  currentPlaceById: Map<string, number>;
  predictedPlaceById: Map<string, number>;
  predictedScoreById: Map<string, { currentTotal: number; predicted: PredictedScore }>;
  teamStandingsById: Map<string, TeamStanding>;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
  onSetRack: (entry: BoardEntry, patch: RackPatch) => void;
}) {
  const { platformName, sessionName, positions, roster } = view;
  const current = positions.onPlatform;

  // Per-lift best and the entry's total/GL both go through the shared entry-score helpers, so the run
  // screen, warm-up board and overlay can't disagree on a lifter's numbers.
  const bestForLift = (entryId: string, lift: LiftType): number => bestLiftFor(attempts, entryId, lift);

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
                {showTeam ? (
                  <th scope="col" className={`w-32 text-left ${HEAD}`}>
                    Team
                  </th>
                ) : null}
                {showLot ? (
                  <th scope="col" className={`w-12 text-center ${HEAD}`}>
                    Lot
                  </th>
                ) : null}
                {showBw ? (
                  <th scope="col" className={`w-14 text-center ${HEAD}`}>
                    BW
                  </th>
                ) : null}
                {showClass ? (
                  <th scope="col" className={`w-28 text-left ${HEAD}`}>
                    Class
                  </th>
                ) : null}
                {showAgeCat ? (
                  <th scope="col" className={`w-24 text-left ${HEAD}`}>
                    Age Cat.
                  </th>
                ) : null}
                {showDivision ? (
                  <th scope="col" className={`w-28 text-left ${HEAD}`}>
                    Division
                  </th>
                ) : null}
                {columnLifts.map((lift) => (
                  <Fragment key={lift}>
                    <FragmentHeader lift={lift} showRack={showRack} showBest={showBest} />
                    {showSubTotal && lift === 'bench' ? (
                      <th scope="col" className={`w-20 text-center ${HEAD}`}>
                        S+B
                      </th>
                    ) : null}
                  </Fragment>
                ))}
                {showTotal ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Total
                  </th>
                ) : null}
                {showGl ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    IPF GL
                  </th>
                ) : null}
                {showCurPlace ? (
                  <th scope="col" className={`w-16 text-center ${HEAD}`}>
                    Place
                  </th>
                ) : null}
                {showPredPlace ? (
                  <th scope="col" className={`w-16 text-center ${HEAD}`}>
                    Pred place
                  </th>
                ) : null}
                {showPredTotal ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Pred total
                  </th>
                ) : null}
                {showPredGl ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Pred GL
                  </th>
                ) : null}
                {showTeamActual ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Team pts
                  </th>
                ) : null}
                {showTeamPred ? (
                  <th scope="col" className={`w-24 text-center ${HEAD}`}>
                    Pred team pts
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {roster.map(({ entry, flightName }, index) => {
                // Total (best S+B+D) and IPF GL come together from the shared entry-score helper; they
                // feed the Total and IPF GL columns (computed only when one of them is shown).
                const { total, glPoints: gl } =
                  showTotal || showGl
                    ? computeEntryScore(attempts, entry, columnLifts, kitType, isTeamCompetition)
                    : { total: 0, glPoints: 0 };
                const subTotal = showSubTotal ? bestForLift(entry.id, 'squat') + bestForLift(entry.id, 'bench') : 0;
                // Standings lookups; the maps are empty (so these are undefined → a dash) unless the
                // matching column is on. In a team comp the place is the lifter's team's place (ranked
                // against the other teams), not an individual one.
                const predicted = predictedScoreById.get(entry.id)?.predicted;
                const teamStanding = entry.teamId ? teamStandingsById.get(entry.teamId) : undefined;
                const currentPlace = isTeamCompetition
                  ? (teamStanding && teamStanding.total > 0 ? teamStanding.rank : undefined)
                  : currentPlaceById.get(entry.id);
                const predictedPlace = isTeamCompetition
                  ? (teamStanding && teamStanding.predictedTotal > 0 ? teamStanding.predictedRank : undefined)
                  : predictedPlaceById.get(entry.id);
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
                  {showTeam ? (
                    <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.teamName ?? '—'}</td>
                  ) : null}
                  {showLot ? (
                    <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.lotNumber ?? '—'}</td>
                  ) : null}
                  {showBw ? (
                    <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.bodyweightKg ?? '—'}</td>
                  ) : null}
                  {showClass ? (
                    <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.weightClassName ?? '—'}</td>
                  ) : null}
                  {showAgeCat ? (
                    <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.ageCategoryName ?? '—'}</td>
                  ) : null}
                  {showDivision ? (
                    <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.division ?? '—'}</td>
                  ) : null}
                  {columnLifts.map((lift) => {
                    const active = isTeamCompetition ? entry.teamLift === lift : true;
                    const best = active ? bestForLift(entry.id, lift) : 0;
                    return (
                      <Fragment key={lift}>
                        <FragmentCells
                          lift={lift}
                          entry={entry}
                          active={active}
                          best={best}
                          attempts={attempts}
                          current={current}
                          showRack={showRack}
                          showBest={showBest}
                          onSetWeight={onSetWeight}
                          onSetResult={onSetResult}
                          onSetRack={onSetRack}
                        />
                        {showSubTotal && lift === 'bench' ? (
                          <td className={`text-center font-semibold tabular-nums text-neutral-800 ${CELL}`}>
                            {subTotal > 0 ? subTotal : '—'}
                          </td>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {showTotal ? (
                    <td className={`text-center font-semibold tabular-nums text-neutral-900 ${CELL}`}>
                      {total > 0 ? total : '—'}
                    </td>
                  ) : null}
                  {showGl ? (
                    <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                      {gl > 0 ? gl.toFixed(2) : '—'}
                    </td>
                  ) : null}
                  {showCurPlace ? (
                    <td className={`text-center font-semibold tabular-nums text-neutral-900 ${CELL}`}>
                      {currentPlace ?? '—'}
                    </td>
                  ) : null}
                  {showPredPlace ? (
                    <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>
                      {predictedPlace ?? '—'}
                    </td>
                  ) : null}
                  {showPredTotal ? (
                    <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                      {predicted && predicted.predictedTotal > 0 ? predicted.predictedTotal : '—'}
                    </td>
                  ) : null}
                  {showPredGl ? (
                    <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                      {predicted && predicted.predictedGlPoints > 0 ? predicted.predictedGlPoints.toFixed(2) : '—'}
                    </td>
                  ) : null}
                  {showTeamActual ? (
                    <td className={`text-center font-semibold tabular-nums text-neutral-900 ${CELL}`}>
                      {teamStanding && teamStanding.total > 0 ? teamStanding.total.toFixed(2) : '—'}
                    </td>
                  ) : null}
                  {showTeamPred ? (
                    <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                      {teamStanding && teamStanding.predictedTotal > 0 ? teamStanding.predictedTotal.toFixed(2) : '—'}
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

function FragmentHeader({ lift, showRack, showBest }: { lift: LiftType; showRack: boolean; showBest: boolean }) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
        <th scope="col" className={`w-24 text-center ${HEAD}`}>
          {LIFT_LABELS[lift]} rack
        </th>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => (
        <th key={`${lift}-${attemptNumber}`} scope="col" className={`w-[5.5rem] text-center ${HEAD}`}>
          {attemptNumber === 1 ? `${LIFT_LABELS[lift]} ${attemptNumber}` : String(attemptNumber)}
        </th>
      ))}
      {showBest ? (
        <th scope="col" className={`w-16 text-center ${HEAD}`}>
          Best
        </th>
      ) : null}
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
  showRack,
  showBest,
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
  showRack: boolean;
  showBest: boolean;
  onSetWeight: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
  onSetRack: (entry: BoardEntry, patch: RackPatch) => void;
}) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
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
      {showBest ? (
        <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>{active && best > 0 ? best : '—'}</td>
      ) : null}
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
        // Result is keyed by the attempt's natural key, not its server id, so ✓ / ✗ work even on an
        // attempt created offline (no id yet) — the result is queued and synced on reconnect.
        <div className="flex justify-center gap-1.5">
          <button
            type="button"
            aria-label={`Good lift for ${entry.lifterName}`}
            aria-pressed={declaredAttempt.result === 'good_lift'}
            onClick={() => onSetResult(declaredAttempt, declaredAttempt.result === 'good_lift' ? 'pending' : 'good_lift')}
            className={
              declaredAttempt.result === 'good_lift'
                ? 'rounded bg-green-600 px-3 py-1 text-sm font-bold text-white'
                : 'rounded border border-green-500 px-3 py-1 text-sm font-bold text-green-700 hover:bg-green-50'
            }
          >
            ✓
          </button>
          <button
            type="button"
            aria-label={`No lift for ${entry.lifterName}`}
            aria-pressed={declaredAttempt.result === 'no_lift'}
            onClick={() => onSetResult(declaredAttempt, declaredAttempt.result === 'no_lift' ? 'pending' : 'no_lift')}
            className={
              declaredAttempt.result === 'no_lift'
                ? 'rounded bg-red-600 px-3 py-1 text-sm font-bold text-white'
                : 'rounded border border-red-500 px-3 py-1 text-sm font-bold text-red-700 hover:bg-red-50'
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
