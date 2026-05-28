import type { Database } from '@/types/database.types';
import { compareValues, nullsLast } from '@/lib/ordering';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// Lifts run in this fixed order within a session: all squats, then all benches, then all deadlifts.
const LIFT_ORDER: Record<LiftType, number> = { squat: 0, bench: 1, deadlift: 2 };

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

// For each flight, the lift+round it is on right now: the earliest contested lift (S, then B, then D)
// that still has a pending, declared attempt, and within it the lowest round still pending. A flight
// with no pending declared attempt (everyone done, or none weighed in) gets no lead.
function leadRoundByFlight(
  attempts: readonly SessionAttempt[],
  flightByEntry: Map<string, string>,
): Map<string, LeadRound> {
  const pendingByFlight = new Map<string, LeadRound[]>();
  for (const attempt of attempts) {
    if (attempt.result !== 'pending' || attempt.weightKg === null) {
      continue;
    }
    const flightId = flightByEntry.get(attempt.entryId);
    if (flightId === undefined) {
      continue;
    }
    const list = pendingByFlight.get(flightId) ?? [];
    list.push({ lift: attempt.lift, round: attempt.attemptNumber });
    pendingByFlight.set(flightId, list);
  }

  const lead = new Map<string, LeadRound>();
  for (const [flightId, pending] of pendingByFlight) {
    let leadLift: LiftType | null = null;
    for (const item of pending) {
      if (leadLift === null || LIFT_ORDER[item.lift] < LIFT_ORDER[leadLift]) {
        leadLift = item.lift;
      }
    }
    if (leadLift === null) {
      continue;
    }
    let leadRound = Number.POSITIVE_INFINITY;
    for (const item of pending) {
      if (item.lift === leadLift && item.round < leadRound) {
        leadRound = item.round;
      }
    }
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
    return flightLead ? [{ entry, lead: flightLead }] : [];
  });
  const inactive = roster.filter((entry) => !lead.has(entry.flightId));

  const activeSorted = active
    .toSorted((a, b) => compareRunningOrder(keyFor(a.entry, a.lead), keyFor(b.entry, b.lead)))
    .map((item) => item.entry);
  const inactiveSorted = inactive.toSorted((a, b) => {
    const byFlight = compareValues(nullsLast(a.flightSortOrder), nullsLast(b.flightSortOrder));
    return byFlight === 0 ? compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber)) : byFlight;
  });

  return [...activeSorted, ...inactiveSorted];
}
