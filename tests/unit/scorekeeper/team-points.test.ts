import { describe, expect, it } from 'vitest';
import { computeTeamPoints } from '@/lib/scorekeeper/team-points';
import { teamGlScore } from '@/lib/scoring/ipf-gl';
import { attemptKey } from '@/lib/realtime/use-board-state';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';
import type { Database } from '@/types/database.types';

type LiftType = Database['public']['Enums']['lift_type'];

function entry(id: string, teamLift: LiftType, overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id,
    lifterName: id,
    sex: 'male',
    flightId: 'f1',
    lotNumber: 1,
    teamLift,
    teamId: 'team-1',
    teamName: 'Iron Vikings',
    bodyweightKg: 90,
    weightClassId: null,
    weightClassName: null,
    divisionId: null,
    divisionName: null,
    rackHeightSquat: null,
    squatRackSetting: null,
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<BoardAttempt> & { entryId: string; lift: LiftType; attemptNumber: number }): BoardAttempt {
  return { id: `${overrides.entryId}-${overrides.lift}-${overrides.attemptNumber}`, weightKg: 100, result: 'pending', decidedAt: null, ...overrides };
}

function attemptsMap(attempts: BoardAttempt[]): Map<string, BoardAttempt> {
  return new Map(attempts.map((a) => [attemptKey(a.entryId, a.lift, a.attemptNumber), a]));
}

describe('computeTeamPoints', () => {
  it('sums actual and predicted GL across the three members', () => {
    const entries = [
      entry('squatter', 'squat', { bodyweightKg: 100 }),
      entry('bencher', 'bench', { bodyweightKg: 85 }),
      entry('puller', 'deadlift', { bodyweightKg: 95 }),
    ];
    const attempts = attemptsMap([
      attempt({ entryId: 'squatter', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
      attempt({ entryId: 'bencher', lift: 'bench', attemptNumber: 1, weightKg: 120, result: 'good_lift' }),
      // Bench second attempt declared but not yet judged — counts only toward the prediction.
      attempt({ entryId: 'bencher', lift: 'bench', attemptNumber: 2, weightKg: 130, result: 'pending' }),
      attempt({ entryId: 'puller', lift: 'deadlift', attemptNumber: 1, weightKg: 250, result: 'good_lift' }),
    ]);

    const points = computeTeamPoints(attempts, entries, 'classic');
    const team = points.get('team-1');

    const expectedActual = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 100, bestLiftKg: 200 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 85, bestLiftKg: 120 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 95, bestLiftKg: 250 },
    ]);
    const expectedPredicted = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 100, bestLiftKg: 200 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 85, bestLiftKg: 130 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 95, bestLiftKg: 250 },
    ]);

    expect(team?.actual).toBe(expectedActual);
    expect(team?.predicted).toBe(expectedPredicted);
    expect(team?.predicted).toBeGreaterThan(team?.actual ?? 0);
  });

  it('ignores entries with no team or no assigned lift', () => {
    const entries = [
      entry('member', 'squat'),
      entry('loner', 'bench', { teamId: null }),
      entry('untagged', 'deadlift', { teamLift: null }),
    ];
    const attempts = attemptsMap([
      attempt({ entryId: 'member', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
    ]);

    const points = computeTeamPoints(attempts, entries, 'classic');
    expect([...points.keys()]).toEqual(['team-1']);
  });

  it('contributes 0 for a member with no good lift toward the actual score', () => {
    const entries = [entry('squatter', 'squat'), entry('bencher', 'bench')];
    const attempts = attemptsMap([
      attempt({ entryId: 'squatter', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
      // Bencher has only a declared opener (no good lift) — 0 actual, but contributes to the prediction.
      attempt({ entryId: 'bencher', lift: 'bench', attemptNumber: 1, weightKg: 120, result: 'pending' }),
    ]);

    const points = computeTeamPoints(attempts, entries, 'classic');
    const team = points.get('team-1');

    const expectedActual = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 90, bestLiftKg: 200 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 90, bestLiftKg: 0 },
    ]);
    expect(team?.actual).toBe(expectedActual);
    expect(team?.predicted).toBeGreaterThan(team?.actual ?? 0);
  });
});
