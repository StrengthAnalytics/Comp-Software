import { describe, expect, it } from 'vitest';
import { ipfGlPoints } from '@/lib/scoring/ipf-gl';
import { attemptKey } from '@/lib/realtime/use-board-state';
import { bestLiftFor, computeEntryScore, contributingLifts } from '@/lib/scorekeeper/entry-score';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';
import type { Database } from '@/types/database.types';

type LiftType = Database['public']['Enums']['lift_type'];
const ALL_LIFTS: LiftType[] = ['squat', 'bench', 'deadlift'];

function entry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: 'e1',
    lifterName: 'Smith, John',
    sex: 'male',
    flightId: 'f1',
    lotNumber: 1,
    teamLift: null,
    teamName: null,
    bodyweightKg: 90,
    weightClassName: '93 kg',
    divisionName: 'Open',
    rackHeightSquat: null,
    squatRackSetting: null,
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<BoardAttempt> = {}): BoardAttempt {
  return {
    id: 'a',
    entryId: 'e1',
    lift: 'squat',
    attemptNumber: 1,
    weightKg: 100,
    result: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

// Builds the attempts map keyed by the natural key, as useBoardState/loadBoardData do.
function attemptsMap(attempts: BoardAttempt[]): Map<string, BoardAttempt> {
  return new Map(attempts.map((a) => [attemptKey(a.entryId, a.lift, a.attemptNumber), a]));
}

describe('bestLiftFor', () => {
  it('returns the heaviest good lift for the entry + lift', () => {
    const attempts = attemptsMap([
      attempt({ id: '1', lift: 'squat', attemptNumber: 1, weightKg: 100, result: 'good_lift' }),
      attempt({ id: '2', lift: 'squat', attemptNumber: 2, weightKg: 110, result: 'good_lift' }),
      attempt({ id: '3', lift: 'squat', attemptNumber: 3, weightKg: 120, result: 'no_lift' }),
    ]);
    expect(bestLiftFor(attempts, 'e1', 'squat')).toBe(110);
  });

  it('returns 0 when there is no good lift (bombed)', () => {
    const attempts = attemptsMap([
      attempt({ id: '1', lift: 'squat', attemptNumber: 1, weightKg: 100, result: 'no_lift' }),
    ]);
    expect(bestLiftFor(attempts, 'e1', 'squat')).toBe(0);
  });

  it('returns 0 when the lift has no attempts at all', () => {
    expect(bestLiftFor(attemptsMap([]), 'e1', 'deadlift')).toBe(0);
  });
});

describe('contributingLifts', () => {
  it('uses all contested lifts for an individual comp', () => {
    expect(contributingLifts(entry(), ALL_LIFTS, false)).toEqual(['squat', 'bench', 'deadlift']);
  });

  it('uses only the assigned lift for a team-comp member', () => {
    expect(contributingLifts(entry({ teamLift: 'bench' }), ALL_LIFTS, true)).toEqual(['bench']);
  });

  it('falls back to all contested lifts for a team comp when the member has no assigned lift', () => {
    expect(contributingLifts(entry({ teamLift: null }), ALL_LIFTS, true)).toEqual(['squat', 'bench', 'deadlift']);
  });
});

describe('computeEntryScore', () => {
  it('sums the best of each contested lift into the total, omitting lifts with no good lift', () => {
    const attempts = attemptsMap([
      attempt({ id: 's', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
      attempt({ id: 'b', lift: 'bench', attemptNumber: 1, weightKg: 120, result: 'good_lift' }),
      // No good deadlift — contributes nothing and is omitted from bestLifts.
      attempt({ id: 'd', lift: 'deadlift', attemptNumber: 1, weightKg: 250, result: 'no_lift' }),
    ]);

    const score = computeEntryScore(attempts, entry(), ALL_LIFTS, 'classic', false);

    expect(score.bestLifts).toEqual([
      { lift: 'squat', weight: 200 },
      { lift: 'bench', weight: 120 },
    ]);
    expect(score.total).toBe(320);
    expect(score.glPoints).toBe(
      ipfGlPoints({ sex: 'male', kitType: 'classic', bodyweightKg: 90, liftedKg: 320 }),
    );
    expect(score.glPoints).toBeGreaterThan(0);
  });

  it('scores a team-comp member from their assigned lift only', () => {
    const attempts = attemptsMap([
      attempt({ id: 's', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
      attempt({ id: 'b', lift: 'bench', attemptNumber: 1, weightKg: 120, result: 'good_lift' }),
    ]);

    const score = computeEntryScore(attempts, entry({ teamLift: 'bench' }), ALL_LIFTS, 'classic', true);

    expect(score.bestLifts).toEqual([{ lift: 'bench', weight: 120 }]);
    expect(score.total).toBe(120);
  });

  it('returns a zero total and zero GL before any good lift', () => {
    const attempts = attemptsMap([
      attempt({ id: 's', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'pending' }),
    ]);

    const score = computeEntryScore(attempts, entry(), ALL_LIFTS, 'classic', false);

    expect(score.bestLifts).toEqual([]);
    expect(score.total).toBe(0);
    expect(score.glPoints).toBe(0);
  });

  it('returns zero GL with a total but no recorded bodyweight (not yet weighed in)', () => {
    const attempts = attemptsMap([
      attempt({ id: 's', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
    ]);

    const score = computeEntryScore(attempts, entry({ bodyweightKg: null }), ALL_LIFTS, 'classic', false);

    expect(score.total).toBe(200);
    // ipfGlPoints returns 0 for a non-positive bodyweight (0 stands in for null).
    expect(score.glPoints).toBe(0);
  });
});
