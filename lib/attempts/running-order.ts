import type { Database } from '@/types/database.types';

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

function nullsLast(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

// Ordered comparison rather than subtraction: two missing values both map to Infinity, and
// Infinity - Infinity is NaN, which would corrupt the sort.
function compareValues(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

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
