import { describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
import {
  compareRunningOrder,
  orderSessionRoster,
  selectLiveSession,
  selectLoadingPositions,
  selectPlatformPositions,
  type RosterEntryFields,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];
type SessionAttempt = {
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
};

const base: RunningOrderFields = {
  lift: 'squat',
  flightSortOrder: 0,
  attemptNumber: 1,
  weightKg: 100,
  lotNumber: 1,
};

function sorted(rows: RunningOrderFields[]): RunningOrderFields[] {
  return rows.toSorted(compareRunningOrder);
}

describe('compareRunningOrder', () => {
  it('orders by lift: squat, then bench, then deadlift', () => {
    const result = sorted([
      { ...base, lift: 'deadlift' },
      { ...base, lift: 'squat' },
      { ...base, lift: 'bench' },
    ]);
    expect(result.map((row) => row.lift)).toEqual(['squat', 'bench', 'deadlift']);
  });

  it('orders by flight before round (flight A fully precedes flight B)', () => {
    // Flight A round 3 must come before flight B round 1.
    const result = sorted([
      { ...base, flightSortOrder: 1, attemptNumber: 1, weightKg: 50 },
      { ...base, flightSortOrder: 0, attemptNumber: 3, weightKg: 300 },
    ]);
    expect(result.map((row) => row.flightSortOrder)).toEqual([0, 1]);
  });

  it('orders by round before weight within a flight', () => {
    const result = sorted([
      { ...base, attemptNumber: 2, weightKg: 80 },
      { ...base, attemptNumber: 1, weightKg: 200 },
    ]);
    expect(result.map((row) => row.attemptNumber)).toEqual([1, 2]);
  });

  it('orders by rising bar (weight ascending) within a round', () => {
    const result = sorted([
      { ...base, weightKg: 120 },
      { ...base, weightKg: 90 },
      { ...base, weightKg: 105 },
    ]);
    expect(result.map((row) => row.weightKg)).toEqual([90, 105, 120]);
  });

  it('breaks equal weights by lot number ascending', () => {
    const result = sorted([
      { ...base, weightKg: 100, lotNumber: 5 },
      { ...base, weightKg: 100, lotNumber: 2 },
    ]);
    expect(result.map((row) => row.lotNumber)).toEqual([2, 5]);
  });

  it('sorts an undeclared weight last within a round', () => {
    const result = sorted([
      { ...base, weightKg: null },
      { ...base, weightKg: 95 },
    ]);
    expect(result.map((row) => row.weightKg)).toEqual([95, null]);
  });
});

describe('selectPlatformPositions', () => {
  const rows = [
    { ...base, id: 'a', weightKg: 100, result: 'pending' as const },
    { ...base, id: 'b', weightKg: 110, result: 'pending' as const },
    { ...base, id: 'c', weightKg: 120, result: 'pending' as const },
    { ...base, id: 'd', weightKg: 130, result: 'pending' as const },
  ];

  it('returns the first three pending attempts in order', () => {
    const { onPlatform, onDeck, inTheHole } = selectPlatformPositions(rows);
    expect([onPlatform?.id, onDeck?.id, inTheHole?.id]).toEqual(['a', 'b', 'c']);
  });

  it('skips attempts that are not pending', () => {
    const { onPlatform } = selectPlatformPositions([
      { ...base, id: 'done', weightKg: 90, result: 'good_lift' as const },
      { ...base, id: 'next', weightKg: 100, result: 'pending' as const },
    ]);
    expect(onPlatform?.id).toBe('next');
  });

  it('skips pending attempts without a declared weight', () => {
    const { onPlatform } = selectPlatformPositions([
      { ...base, id: 'undeclared', weightKg: null, result: 'pending' as const },
      { ...base, id: 'declared', weightKg: 100, result: 'pending' as const },
    ]);
    expect(onPlatform?.id).toBe('declared');
  });

  it('returns nulls when the queue is empty', () => {
    expect(selectPlatformPositions([])).toEqual({ onPlatform: null, onDeck: null, inTheHole: null });
  });
});

describe('selectLoadingPositions', () => {
  it('loads for the first pending attempt, with the next pending on deck', () => {
    const rows = [
      { ...base, id: 'a', weightKg: 100, result: 'pending' as const },
      { ...base, id: 'b', weightKg: 110, result: 'pending' as const },
      { ...base, id: 'c', weightKg: 120, result: 'pending' as const },
    ];
    const { current, onDeck } = selectLoadingPositions(rows);
    expect([current?.id, onDeck?.id]).toEqual(['a', 'b']);
  });

  it('reports the just-decided lifter immediately before current as previous', () => {
    const rows = [
      { ...base, id: 'done', weightKg: 90, result: 'good_lift' as const },
      { ...base, id: 'now', weightKg: 100, result: 'pending' as const },
      { ...base, id: 'next', weightKg: 110, result: 'pending' as const },
    ];
    const { previous, current, onDeck } = selectLoadingPositions(rows);
    expect([previous?.id, current?.id, onDeck?.id]).toEqual(['done', 'now', 'next']);
  });

  it('takes the nearest decided attempt before current as previous (not the earliest)', () => {
    const rows = [
      { ...base, id: 'first', weightKg: 80, result: 'good_lift' as const },
      { ...base, id: 'second', weightKg: 90, result: 'no_lift' as const },
      { ...base, id: 'now', weightKg: 100, result: 'pending' as const },
    ];
    expect(selectLoadingPositions(rows).previous?.id).toBe('second');
  });

  it('treats a failed lift as a valid previous lifter', () => {
    const rows = [
      { ...base, id: 'missed', weightKg: 90, result: 'no_lift' as const },
      { ...base, id: 'now', weightKg: 100, result: 'pending' as const },
    ];
    expect(selectLoadingPositions(rows).previous?.id).toBe('missed');
  });

  it('has no previous at the very start of a round', () => {
    const rows = [{ ...base, id: 'first', weightKg: 100, result: 'pending' as const }];
    const { previous, current } = selectLoadingPositions(rows);
    expect(previous).toBeNull();
    expect(current?.id).toBe('first');
  });

  it('keeps the last decided lifter as previous once nothing is left to lift', () => {
    const rows = [
      { ...base, id: 'a', weightKg: 90, result: 'good_lift' as const },
      { ...base, id: 'b', weightKg: 100, result: 'good_lift' as const },
    ];
    const { previous, current, onDeck } = selectLoadingPositions(rows);
    expect(previous?.id).toBe('b');
    expect(current).toBeNull();
    expect(onDeck).toBeNull();
  });

  it('ignores pending attempts without a declared weight', () => {
    const rows = [
      { ...base, id: 'undeclared', weightKg: null, result: 'pending' as const },
      { ...base, id: 'declared', weightKg: 100, result: 'pending' as const },
    ];
    expect(selectLoadingPositions(rows).current?.id).toBe('declared');
  });

  it('returns nulls for an empty session', () => {
    expect(selectLoadingPositions([])).toEqual({ previous: null, current: null, onDeck: null });
  });
});

describe('selectLiveSession', () => {
  const sessions = [
    { id: 's1', sortOrder: 0 },
    { id: 's2', sortOrder: 1 },
    { id: 's3', sortOrder: 2 },
  ];

  it('returns the earliest session that is not finished', () => {
    // s1 has attempts but is still pending → it is live, not s2.
    const attemptCounts = new Map([['s1', 5]]);
    const pendingCounts = new Map([['s1', 2]]);
    expect(selectLiveSession(sessions, attemptCounts, pendingCounts)?.id).toBe('s1');
  });

  it('rolls forward only once a later session has started lifting', () => {
    // s1 has no pending left AND s2 has begun → s1 is finished, s2 is live.
    const attemptCounts = new Map([
      ['s1', 8],
      ['s2', 1],
    ]);
    const pendingCounts = new Map([['s2', 1]]);
    expect(selectLiveSession(sessions, attemptCounts, pendingCounts)?.id).toBe('s2');
  });

  it('holds the current session through a between-rounds gap (no later session yet)', () => {
    // s1 momentarily has no pending rows but nothing later has started → s1 stays live.
    const attemptCounts = new Map([['s1', 8]]);
    const pendingCounts = new Map<string, number>();
    expect(selectLiveSession(sessions, attemptCounts, pendingCounts)?.id).toBe('s1');
  });

  it('falls back to the last session when every session is finished', () => {
    const attemptCounts = new Map([
      ['s1', 8],
      ['s2', 8],
      ['s3', 8],
    ]);
    const pendingCounts = new Map<string, number>();
    expect(selectLiveSession(sessions, attemptCounts, pendingCounts)?.id).toBe('s3');
  });

  it('returns null for no sessions', () => {
    expect(selectLiveSession([], new Map(), new Map())).toBeNull();
  });
});

// A lifter in flight A (sort order 0) unless overridden.
function lifter(entryId: string, lotNumber: number, overrides: Partial<RosterEntryFields> = {}): RosterEntryFields {
  return { entryId, flightId: 'A', flightSortOrder: 0, lotNumber, ...overrides };
}

function attempt(
  entryId: string,
  lift: LiftType,
  attemptNumber: number,
  weightKg: number | null,
  result: AttemptResult,
): SessionAttempt {
  return { entryId, lift, attemptNumber, weightKg, result };
}

function ids(rows: RosterEntryFields[]): string[] {
  return rows.map((row) => row.entryId);
}

describe('orderSessionRoster', () => {
  it('orders the live flight by the round-in-progress bar weight, lightest first', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'pending'),
      attempt('b', 'squat', 1, 120, 'pending'),
      attempt('c', 'squat', 1, 90, 'pending'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['c', 'a', 'b']);
  });

  it('keeps a completed lifter in their round slot (stable within a round)', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    // c has already taken their first attempt; the round is still in progress for a and b.
    const attempts = [
      attempt('a', 'squat', 1, 100, 'pending'),
      attempt('b', 'squat', 1, 120, 'pending'),
      attempt('c', 'squat', 1, 90, 'good_lift'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['c', 'a', 'b']);
  });

  it('re-sorts by the next round once the current round is complete', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('c', 'squat', 1, 90, 'good_lift'),
      // Round two declared with a different order of jumps.
      attempt('a', 'squat', 2, 130, 'pending'),
      attempt('b', 'squat', 2, 110, 'pending'),
      attempt('c', 'squat', 2, 140, 'pending'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['b', 'a', 'c']);
  });

  it('advances to the next lift once every round of the current lift is done', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    const attempts = [
      // All three squat rounds resolved for everyone.
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('a', 'squat', 3, 120, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('b', 'squat', 2, 130, 'good_lift'),
      attempt('b', 'squat', 3, 140, 'good_lift'),
      attempt('c', 'squat', 1, 90, 'good_lift'),
      attempt('c', 'squat', 2, 100, 'good_lift'),
      attempt('c', 'squat', 3, 110, 'good_lift'),
      // Bench openers seeded, none lifted yet — order should now be by bench openers.
      attempt('a', 'bench', 1, 80, 'pending'),
      attempt('b', 'bench', 1, 100, 'pending'),
      attempt('c', 'bench', 1, 60, 'pending'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['c', 'a', 'b']);
  });

  it('holds the current lift through the gap before the next round is declared', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    const attempts = [
      // Squat round 1 fully resolved; round 2 not declared yet.
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('c', 'squat', 1, 90, 'good_lift'),
      // Bench openers are seeded pending at weigh-in, but bench has not started.
      attempt('a', 'bench', 1, 60, 'pending'),
      attempt('b', 'bench', 1, 50, 'pending'),
      attempt('c', 'bench', 1, 70, 'pending'),
    ];
    // Order holds in squat round-1 order (c, a, b), NOT bench-opener order (b, a, c).
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['c', 'a', 'b']);
  });

  it('advances once the next lift has started, even if no third attempt was taken', () => {
    const roster = [lifter('a', 1), lifter('b', 2)];
    const attempts = [
      // Squats stopped at round 2 (no third attempts) for both.
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('b', 'squat', 2, 130, 'good_lift'),
      // Bench has begun: a's opener is resolved, b's is pending.
      attempt('a', 'bench', 1, 70, 'good_lift'),
      attempt('b', 'bench', 1, 90, 'pending'),
    ];
    // Lead is on bench (it has started), ordered by bench opener: a (70) then b (90).
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['a', 'b']);
  });

  it('keeps each flight together, flight A before flight B', () => {
    const roster = [
      lifter('a', 1),
      lifter('b', 1, { entryId: 'b', flightId: 'B', flightSortOrder: 1 }),
    ];
    const attempts = [
      // Flight B is on a lighter bar but still runs after flight A.
      attempt('a', 'squat', 1, 100, 'pending'),
      attempt('b', 'squat', 1, 50, 'pending'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['a', 'b']);
  });

  it('sinks an un-weighed lifter (no attempts) below the declared lifters of their flight', () => {
    const roster = [lifter('a', 1), lifter('d', 2)];
    const attempts = [attempt('a', 'squat', 1, 100, 'pending')];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['a', 'd']);
  });

  it('sinks a flight with nothing left to lift to the bottom', () => {
    const roster = [
      lifter('a', 1),
      lifter('done', 1, { entryId: 'done', flightId: 'B', flightSortOrder: 1 }),
    ];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'pending'),
      // Flight B lifter has finished every attempt.
      attempt('done', 'squat', 1, 90, 'good_lift'),
      attempt('done', 'bench', 1, 70, 'good_lift'),
      attempt('done', 'deadlift', 1, 120, 'good_lift'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['a', 'done']);
  });

  it('orders a single-discipline flight (e.g. bench-only) that has no squat or deadlift attempts', () => {
    const roster = [lifter('a', 1), lifter('b', 2), lifter('c', 3)];
    const attempts = [
      attempt('a', 'bench', 1, 100, 'pending'),
      attempt('b', 'bench', 1, 80, 'pending'),
      attempt('c', 'bench', 1, 120, 'pending'),
    ];
    // The lead skips the lifts the flight does not contest and lands on bench round 1.
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['b', 'a', 'c']);
  });

  it('ignores attempts whose entry is not in the roster', () => {
    const roster = [lifter('a', 1)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'pending'),
      attempt('ghost', 'squat', 1, 50, 'pending'),
    ];
    expect(ids(orderSessionRoster(roster, attempts))).toEqual(['a']);
  });

  it('falls back to flight-then-lot order when no attempts exist yet', () => {
    const roster = [lifter('a', 2), lifter('b', 1)];
    expect(ids(orderSessionRoster(roster, []))).toEqual(['b', 'a']);
  });
});
