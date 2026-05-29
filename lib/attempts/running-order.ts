import type { Database } from '@/types/database.types';
import { compareValues, nullsLast } from '@/lib/ordering';
import { ATTEMPTS_PER_LIFT } from '@/lib/constants';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// Lifts run in this fixed order within a session: all squats, then all benches, then all deadlifts.
const LIFT_ORDER: Record<LiftType, number> = { squat: 0, bench: 1, deadlift: 2 };
const LIFTS_IN_ORDER: LiftType[] = ['squat', 'bench', 'deadlift'];

// Fields needed to place an attempt in a session's running order. Session selection (which session is
// live on a platform) is handled by the caller; this comparator orders attempts within one session.
export type RunningOrderFields = {
  lift: LiftType;
  // Flight sort order; flights run one fully before the next (A then B then C).
  flightSortOrder: number | null;
  // The lifter's round = their attempt number (1, 2, 3).
  attemptNumber: number;
  // Declared weight in kg. Undeclared (null) sorts last so it does not lead the order.
  weightKg: number | null;
  lotNumber: number | null;
};

// Orders attempts within a session: lift (S, B, D), then flight (A, B, C), then round (attempt 1, 2,
// 3), then rising bar (weight ascending), then lot number to break equal weights. Because flight is
// part of the key, the platform rolls from one flight straight into the next, then into the next lift
// — no operator switch. (CLAUDE.md attempt-order rule, extended to a whole session.)
export function compareRunningOrder(a: RunningOrderFields, b: RunningOrderFields): number {
  const byLift = compareValues(LIFT_ORDER[a.lift], LIFT_ORDER[b.lift]);
  if (byLift !== 0) {
    return byLift;
  }
  const byFlight = compareValues(nullsLast(a.flightSortOrder), nullsLast(b.flightSortOrder));
  if (byFlight !== 0) {
    return byFlight;
  }
  const byRound = compareValues(a.attemptNumber, b.attemptNumber);
  if (byRound !== 0) {
    return byRound;
  }
  const byWeight = compareValues(nullsLast(a.weightKg), nullsLast(b.weightKg));
  if (byWeight !== 0) {
    return byWeight;
  }
  return compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber));
}

// The minimal session shape live-session selection needs. Session/platform identity and naming are
// the caller's concern; this only orders and counts.
export type LiveSessionFields = { id: string; sortOrder: number };

// A session is finished only once a LATER session on the same platform has begun lifting — so the
// live session stays put through between-rounds gaps (no pending rows for a moment) and only rolls
// forward when the next session actually starts. Pass the sessions of one platform plus per-session
// attempt and pending counts.
export function isSessionFinished(
  session: LiveSessionFields,
  platformSessions: readonly LiveSessionFields[],
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

// The live session on a platform: the earliest not-yet-finished session, falling back to the last
// session once they are all finished. Pass the platform's sessions in ascending sort order. Returns
// null only when the list is empty. Single-sources the rule for the run screen and the loading-crew
// display so they never disagree on which session is live.
export function selectLiveSession<S extends LiveSessionFields>(
  platformSessions: readonly S[],
  attemptCountBySession: Map<string, number>,
  pendingCountBySession: Map<string, number>,
): S | null {
  return (
    platformSessions.find(
      (session) => !isSessionFinished(session, platformSessions, attemptCountBySession, pendingCountBySession),
    ) ??
    platformSessions.at(-1) ??
    null
  );
}

export type PlatformPositions<T> = {
  onPlatform: T | null;
  onDeck: T | null;
  inTheHole: T | null;
};

// The next three lifters up, in running order: the first pending attempt with a declared weight is on
// the platform, then on deck, then in the hole. Pass the attempts of one session (one platform).
export function selectPlatformPositions<T extends RunningOrderFields & { result: AttemptResult }>(
  attempts: readonly T[],
): PlatformPositions<T> {
  const queue = attempts
    .filter((attempt) => attempt.result === 'pending' && attempt.weightKg !== null)
    .toSorted(compareRunningOrder);

  return {
    onPlatform: queue[0] ?? null,
    onDeck: queue[1] ?? null,
    inTheHole: queue[2] ?? null,
  };
}

// The previous / current / on-deck triple the loading-crew display rotates through: the bar is
// loaded for `current`, `previous` is the attempt just decided, `onDeck` is the one after current.
export type LoadingPositions<T> = {
  previous: T | null;
  current: T | null;
  onDeck: T | null;
};

// The three attempts framing the platform for the loading crew. `current` and `onDeck` are the first
// two pending attempts with a declared weight (the same queue selectPlatformPositions uses), and
// `previous` is the most recently decided attempt sitting immediately before `current` in running
// order — the lifter who just went. With no current attempt left (round/flight finished) `previous`
// is the last decided attempt overall. Decided means a good or no lift; not-taken/withdrawn count as
// decided too so a skipped attempt does not become the "previous" forever.
export function selectLoadingPositions<T extends RunningOrderFields & { result: AttemptResult }>(
  attempts: readonly T[],
): LoadingPositions<T> {
  const declared = attempts.filter((attempt) => attempt.weightKg !== null).toSorted(compareRunningOrder);
  const pending = declared.filter((attempt) => attempt.result === 'pending');
  const current = pending[0] ?? null;
  const onDeck = pending[1] ?? null;

  let previous: T | null = null;
  if (current) {
    // Walk the ordered declared attempts and keep the last decided one that sorts before current.
    for (const attempt of declared) {
      if (attempt.result !== 'pending' && compareRunningOrder(attempt, current) < 0) {
        previous = attempt;
      }
    }
  } else {
    // Nothing left to lift: the previous lifter is the last decided attempt in the order.
    previous = declared.findLast((attempt) => attempt.result !== 'pending') ?? null;
  }

  return { previous, current, onDeck };
}

// One attempt from a live session, enough to place its flight in the running order.
type SessionAttempt = {
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
};

// The minimal shape the roster ordering needs from a lifter; the caller's richer row rides along.
export type RosterEntryFields = {
  entryId: string;
  flightId: string;
  flightSortOrder: number | null;
  lotNumber: number | null;
};

// A flight's lead attempt: the lift and round it is currently working through.
type LeadRound = { lift: LiftType; round: number };

// What a flight has done so far in one lift, enough to tell whether the lift is finished.
type FlightLiftState = {
  pendingRounds: number[];
  maxRound: number;
  // The lift has actually been lifted (a resolved attempt, or a 2nd/3rd attempt declared) — as opposed
  // to only its opener sitting seeded-and-pending from weigh-in.
  hasActivity: boolean;
};

// For each flight, the lift+round it is on right now. The flight is on the earliest contested lift
// (squat, then bench, then deadlift) that is not yet complete; within it, the lowest round that still
// has a pending attempt, or — in the gap between rounds, before the next is declared — the last round
// reached, so the order holds steady instead of jumping. A lift counts as complete only once it has no
// pending attempt AND either its final round has been reached or a later lift has begun lifting; this
// stops the seeded next-lift openers (every lift's opener is seeded pending at weigh-in) from stealing
// the lead during the gap between rounds. A flight with no pending attempt anywhere (everyone done, or
// none weighed in) gets no lead and sinks to the bottom.
function leadRoundByFlight(
  attempts: readonly SessionAttempt[],
  flightByEntry: Map<string, string>,
): Map<string, LeadRound> {
  const byFlight = new Map<string, Map<LiftType, FlightLiftState>>();
  const flightsWithPending = new Set<string>();

  for (const attempt of attempts) {
    const flightId = flightByEntry.get(attempt.entryId);
    if (flightId === undefined) {
      continue;
    }
    const liftStates = byFlight.get(flightId) ?? new Map<LiftType, FlightLiftState>();
    const state = liftStates.get(attempt.lift) ?? { pendingRounds: [], maxRound: 0, hasActivity: false };
    state.maxRound = Math.max(state.maxRound, attempt.attemptNumber);
    if (attempt.result === 'pending') {
      if (attempt.weightKg !== null) {
        state.pendingRounds.push(attempt.attemptNumber);
        flightsWithPending.add(flightId);
      }
    } else {
      state.hasActivity = true;
    }
    if (attempt.attemptNumber >= 2) {
      state.hasActivity = true;
    }
    liftStates.set(attempt.lift, state);
    byFlight.set(flightId, liftStates);
  }

  const lead = new Map<string, LeadRound>();
  for (const [flightId, liftStates] of byFlight) {
    if (!flightsWithPending.has(flightId)) {
      continue;
    }
    let leadLift: LiftType | null = null;
    for (const lift of LIFTS_IN_ORDER) {
      const state = liftStates.get(lift);
      if (!state) {
        continue;
      }
      const laterStarted = LIFTS_IN_ORDER.some(
        (later) => LIFT_ORDER[later] > LIFT_ORDER[lift] && (liftStates.get(later)?.hasActivity ?? false),
      );
      const complete = state.pendingRounds.length === 0 && (state.maxRound >= ATTEMPTS_PER_LIFT || laterStarted);
      if (!complete) {
        leadLift = lift;
        break;
      }
    }
    if (leadLift === null) {
      continue;
    }
    const state = liftStates.get(leadLift);
    if (!state) {
      continue;
    }
    const leadRound = state.pendingRounds.length > 0 ? Math.min(...state.pendingRounds) : state.maxRound;
    lead.set(flightId, { lift: leadLift, round: leadRound });
  }
  return lead;
}

// Orders a live session's roster (one row per lifter) by running order: within each flight the lifters
// are ranked by the bar weight of the round in progress (lightest first, via compareRunningOrder), so
// the rows read like the lifting order. Completed attempts of that round keep their slot — the bar
// weight orders them, not whether they have lifted — so the list is stable through a round and only
// re-sorts as the round, lift, then flight advances. Lifters whose flight has nothing left to lift fall
// to the bottom in flight-then-lot order. Pure; unit-tested.
export function orderSessionRoster<E extends RosterEntryFields>(
  roster: readonly E[],
  attempts: readonly SessionAttempt[],
): E[] {
  const flightByEntry = new Map(roster.map((entry) => [entry.entryId, entry.flightId]));
  const lead = leadRoundByFlight(attempts, flightByEntry);

  const weightByAttempt = new Map<string, number | null>();
  for (const attempt of attempts) {
    weightByAttempt.set(`${attempt.entryId}:${attempt.lift}:${attempt.attemptNumber}`, attempt.weightKg);
  }

  const keyFor = (entry: E, flightLead: LeadRound): RunningOrderFields => ({
    lift: flightLead.lift,
    flightSortOrder: entry.flightSortOrder,
    attemptNumber: flightLead.round,
    weightKg: weightByAttempt.get(`${entry.entryId}:${flightLead.lift}:${flightLead.round}`) ?? null,
    lotNumber: entry.lotNumber,
  });

  const active = roster.flatMap((entry) => {
    const flightLead = lead.get(entry.flightId);
    return flightLead ? [{ entry, flightLead }] : [];
  });
  const inactive = roster.filter((entry) => !lead.has(entry.flightId));

  const activeSorted = active
    .toSorted((a, b) => compareRunningOrder(keyFor(a.entry, a.flightLead), keyFor(b.entry, b.flightLead)))
    .map((item) => item.entry);
  const inactiveSorted = inactive.toSorted((a, b) => {
    const byFlight = compareValues(nullsLast(a.flightSortOrder), nullsLast(b.flightSortOrder));
    return byFlight === 0 ? compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber)) : byFlight;
  });

  return [...activeSorted, ...inactiveSorted];
}
