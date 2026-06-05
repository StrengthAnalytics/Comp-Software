import { describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';
import {
  compareRunningOrder,
  completedSessionLifts,
  orderSessionRoster,
  orderTeamSessionRoster,
  selectLiveSession,
  selectLoadingPositions,
  selectPlatformPositions,
  selectUpcomingLifters,
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

describe('selectUpcomingLifters', () => {
  const rows = [
    { ...base, id: 'a', weightKg: 100, result: 'pending' as const },
    { ...base, id: 'b', weightKg: 110, result: 'pending' as const },
    { ...base, id: 'c', weightKg: 120, result: 'pending' as const },
    { ...base, id: 'd', weightKg: 130, result: 'pending' as const },
    { ...base, id: 'e', weightKg: 140, result: 'pending' as const },
    { ...base, id: 'f', weightKg: 150, result: 'pending' as const },
  ];

  it('returns the next `count` pending lifters in running order', () => {
    expect(selectUpcomingLifters(rows, 5).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(selectUpcomingLifters(rows, 1).map((row) => row.id)).toEqual(['a']);
  });

  it('returns fewer than `count` when the queue is shorter', () => {
    expect(selectUpcomingLifters(rows.slice(0, 2), 5).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('skips decided attempts and undeclared weights', () => {
    expect(
      selectUpcomingLifters(
        [
          { ...base, id: 'done', weightKg: 90, result: 'good_lift' as const },
          { ...base, id: 'undeclared', weightKg: null, result: 'pending' as const },
          { ...base, id: 'next', weightKg: 100, result: 'pending' as const },
        ],
        5,
      ).map((row) => row.id),
    ).toEqual(['next']);
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

// A team-comp roster row: reuses `lifter` and tags on the member's single assigned lift.
function member(
  entryId: string,
  teamLift: LiftType | null,
  overrides: Partial<RosterEntryFields> = {},
  lotNumber = 1,
): RosterEntryFields & { teamLift: LiftType | null } {
  return { ...lifter(entryId, lotNumber, overrides), teamLift };
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

describe('orderTeamSessionRoster', () => {
  // Flight A (sort 0) and flight B (sort 1).
  const flightB = { flightId: 'B', flightSortOrder: 1 };

  it('groups by lift across flights — every squatter, then every bencher', () => {
    // Two flights, each with a squatter and a bencher. Grouping by the flight's single current lift
    // would interleave them (s_a, b_a, s_b, b_b); a team comp groups by lift across the session.
    const roster = [
      member('s_a', 'squat'),
      member('b_a', 'bench'),
      member('s_b', 'squat', flightB),
      member('b_b', 'bench', flightB),
    ];
    const attempts = [
      attempt('s_a', 'squat', 1, 100, 'pending'),
      attempt('b_a', 'bench', 1, 80, 'pending'),
      attempt('s_b', 'squat', 1, 110, 'pending'),
      attempt('b_b', 'bench', 1, 90, 'pending'),
    ];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['s_a', 's_b', 'b_a', 'b_b']);
  });

  it('orders within a lift by the round-in-progress bar weight, lightest first', () => {
    const roster = [member('a', 'squat', {}, 1), member('b', 'squat', {}, 2)];
    const attempts = [
      attempt('a', 'squat', 1, 120, 'pending'),
      attempt('b', 'squat', 1, 100, 'pending'),
    ];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['b', 'a']);
  });

  it('drops a flight that has finished a lift below the flight still working it', () => {
    // Flight A's squatter is done (all three good); flight B's squatter is mid-lift. Within the squat
    // group the live flight leads even though it sorts later by flight, and the finished flight drops.
    const roster = [member('done', 'squat'), member('live', 'squat', flightB)];
    const attempts = [
      attempt('done', 'squat', 1, 100, 'good_lift'),
      attempt('done', 'squat', 2, 110, 'good_lift'),
      attempt('done', 'squat', 3, 120, 'good_lift'),
      attempt('live', 'squat', 1, 90, 'pending'),
    ];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['live', 'done']);
  });

  it('holds a flight between rounds above a later flight not yet on the lift', () => {
    // Flight A finished squat round 1 (decided) but round 2 is not declared yet — a normal
    // between-rounds gap. Flight B has not squatted; its seeded opener is pending+declared. Flight A
    // must NOT read as "finished" and drop below B: it is only paused, with rounds 2-3 still to come.
    const roster = [member('a', 'squat'), member('b', 'squat', flightB)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('b', 'squat', 1, 90, 'pending'),
    ];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['a', 'b']);
  });

  it('keeps a member who has taken their attempt in slot while their flight is still on the round', () => {
    const roster = [member('a', 'squat', {}, 1), member('b', 'squat', {}, 2)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('b', 'squat', 1, 90, 'pending'),
    ];
    // a has lifted but the flight's squat round is still in progress (b pending), so a holds its
    // bar-weight slot rather than dropping: ordered by round-1 weight, b (90) then a (100).
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['b', 'a']);
  });

  it('sinks a member with no attempt for their lift (not weighed in) to the bottom', () => {
    const roster = [member('a', 'squat', {}, 1), member('nw', 'squat', {}, 5)];
    const attempts = [attempt('a', 'squat', 1, 100, 'pending')];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['a', 'nw']);
  });

  it('sinks a member with no assigned lift to the bottom', () => {
    const roster = [member('a', 'squat'), member('none', null)];
    const attempts = [attempt('a', 'squat', 1, 100, 'pending')];
    expect(ids(orderTeamSessionRoster(roster, attempts))).toEqual(['a', 'none']);
  });
});

// Sorted lift list for stable comparison of a completed-lift set.
function lifts(set: Set<LiftType>): LiftType[] {
  return [...set].toSorted();
}

describe('completedSessionLifts', () => {
  const flightB = { flightId: 'B', flightSortOrder: 1 };

  it('returns nothing at the very start when only openers are seeded pending', () => {
    const roster = [lifter('a', 1), lifter('b', 2)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'pending'),
      attempt('b', 'squat', 1, 120, 'pending'),
      attempt('a', 'bench', 1, 60, 'pending'),
      attempt('b', 'bench', 1, 70, 'pending'),
      attempt('a', 'deadlift', 1, 140, 'pending'),
      attempt('b', 'deadlift', 1, 150, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual([]);
  });

  it('marks squat finished once every round is resolved, before bench has started', () => {
    const roster = [lifter('a', 1), lifter('b', 2)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('a', 'squat', 3, 120, 'no_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('b', 'squat', 2, 130, 'good_lift'),
      attempt('b', 'squat', 3, 140, 'good_lift'),
      // Bench/deadlift openers seeded pending — not started.
      attempt('a', 'bench', 1, 60, 'pending'),
      attempt('b', 'bench', 1, 70, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['squat']);
  });

  it('does NOT mark squat finished during the gap between rounds (round 1 decided, round 2 not declared)', () => {
    const roster = [lifter('a', 1), lifter('b', 2)];
    const attempts = [
      // Squat round 1 resolved; round 2 not declared yet — a normal between-rounds pause.
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      // Bench openers seeded pending at weigh-in, but bench has not started.
      attempt('a', 'bench', 1, 60, 'pending'),
      attempt('b', 'bench', 1, 70, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual([]);
  });

  it('does NOT mark squat finished while another flight is still squatting', () => {
    const roster = [lifter('a', 1), lifter('b', 1, { entryId: 'b', ...flightB })];
    const attempts = [
      // Flight A is through all three squat rounds…
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('a', 'squat', 3, 120, 'good_lift'),
      // …but flight B has only just started squatting.
      attempt('b', 'squat', 1, 90, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual([]);
  });

  it('marks squat finished once it is done in every flight', () => {
    const roster = [lifter('a', 1), lifter('b', 1, { entryId: 'b', ...flightB })];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('a', 'squat', 3, 120, 'good_lift'),
      attempt('b', 'squat', 1, 90, 'good_lift'),
      attempt('b', 'squat', 2, 100, 'good_lift'),
      attempt('b', 'squat', 3, 110, 'good_lift'),
      // Bench started in flight A only.
      attempt('a', 'bench', 1, 60, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['squat']);
  });

  it('marks squat finished once bench has started even if no third squat was taken', () => {
    const roster = [lifter('a', 1), lifter('b', 2)];
    const attempts = [
      // Squats stopped at round 2 for both.
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('b', 'squat', 1, 120, 'good_lift'),
      attempt('b', 'squat', 2, 130, 'good_lift'),
      // Bench has begun: a resolved, b pending.
      attempt('a', 'bench', 1, 70, 'good_lift'),
      attempt('b', 'bench', 1, 90, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['squat']);
  });

  it('marks both squat and bench finished once the session is on deadlifts', () => {
    const roster = [lifter('a', 1)];
    const attempts = [
      attempt('a', 'squat', 1, 100, 'good_lift'),
      attempt('a', 'squat', 2, 110, 'good_lift'),
      attempt('a', 'squat', 3, 120, 'good_lift'),
      attempt('a', 'bench', 1, 60, 'good_lift'),
      attempt('a', 'bench', 2, 65, 'good_lift'),
      attempt('a', 'bench', 3, 70, 'good_lift'),
      // Deadlift opener pending — in progress.
      attempt('a', 'deadlift', 1, 140, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['bench', 'squat']);
  });

  it('marks every lift finished once the whole session is done', () => {
    const roster = [lifter('a', 1)];
    const attempts = (['squat', 'bench', 'deadlift'] as LiftType[]).flatMap((lift) => [
      attempt('a', lift, 1, 100, 'good_lift'),
      attempt('a', lift, 2, 110, 'good_lift'),
      attempt('a', lift, 3, 120, 'good_lift'),
    ]);
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['bench', 'deadlift', 'squat']);
  });

  it('returns nothing for an empty session', () => {
    expect(lifts(completedSessionLifts([], [], false))).toEqual([]);
    expect(lifts(completedSessionLifts([lifter('a', 1)], [], false))).toEqual([]);
  });

  it("team comp: a member's later discipline does not finish another member's earlier lift", () => {
    // One flight, two members of the same team: a squatter and a bencher. The squatter has taken two
    // squats and not declared a third; the bencher has started benching. In a team comp each member
    // contests a single lift, so the bencher's activity must NOT collapse the squat — the squatter may
    // still take a third. (Mirrors orderTeamSessionRoster passing laterStarted = false.)
    const roster = [member('s', 'squat'), member('b', 'bench')];
    const attempts = [
      attempt('s', 'squat', 1, 100, 'good_lift'),
      attempt('s', 'squat', 2, 110, 'good_lift'),
      attempt('b', 'bench', 1, 80, 'good_lift'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, true))).toEqual([]);
    // The same rows in an individual flight would: a later lift starting means squat is done there.
    expect(lifts(completedSessionLifts(roster, attempts, false))).toEqual(['squat']);
  });

  it('team comp: a lift finishes once its contesting members reach their final round', () => {
    const roster = [member('s', 'squat'), member('b', 'bench')];
    const attempts = [
      attempt('s', 'squat', 1, 100, 'good_lift'),
      attempt('s', 'squat', 2, 110, 'good_lift'),
      attempt('s', 'squat', 3, 120, 'good_lift'),
      // The bencher is mid-bench; bench is not finished.
      attempt('b', 'bench', 1, 80, 'pending'),
    ];
    expect(lifts(completedSessionLifts(roster, attempts, true))).toEqual(['squat']);
  });
});
