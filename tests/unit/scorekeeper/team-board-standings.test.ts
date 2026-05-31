import { describe, expect, it } from 'vitest';
import { computeBoardTeamStandings } from '@/lib/scorekeeper/team-board-standings';
import { attemptKey } from '@/lib/realtime/use-board-state';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';
import type { Database } from '@/types/database.types';

type LiftType = Database['public']['Enums']['lift_type'];

function entry(id: string, teamId: string, teamName: string, teamLift: LiftType, overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id,
    lifterName: id,
    sex: 'male',
    flightId: 'f1',
    lotNumber: 1,
    teamLift,
    teamId,
    teamName,
    bodyweightKg: 100,
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

function attempt(o: Partial<BoardAttempt> & { entryId: string; lift: LiftType; attemptNumber: number }): BoardAttempt {
  return { id: `${o.entryId}-${o.lift}-${o.attemptNumber}`, weightKg: 100, result: 'pending', decidedAt: null, ...o };
}

function attemptsMap(attempts: BoardAttempt[]): Map<string, BoardAttempt> {
  return new Map(attempts.map((a) => [attemptKey(a.entryId, a.lift, a.attemptNumber), a]));
}

describe('computeBoardTeamStandings', () => {
  it('ranks teams by actual points, and by predicted points independently', () => {
    const entries = [
      entry('a', 'team-a', 'Alpha', 'squat'),
      entry('b', 'team-b', 'Bravo', 'squat'),
    ];
    const attempts = attemptsMap([
      // Alpha trails on the good lift but has a heavier squat declared and not yet judged.
      attempt({ entryId: 'a', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
      attempt({ entryId: 'a', lift: 'squat', attemptNumber: 2, weightKg: 240, result: 'pending' }),
      attempt({ entryId: 'b', lift: 'squat', attemptNumber: 1, weightKg: 220, result: 'good_lift' }),
    ]);

    const standings = computeBoardTeamStandings(attempts, entries, 'classic');
    const alpha = standings.get('team-a');
    const bravo = standings.get('team-b');

    // Actual: Bravo (220) leads Alpha (200).
    expect(bravo?.rank).toBe(1);
    expect(alpha?.rank).toBe(2);
    // Predicted: Alpha's declared 240 overtakes Bravo's 220.
    expect(alpha?.predictedRank).toBe(1);
    expect(bravo?.predictedRank).toBe(2);
    expect(alpha?.predictedTotal).toBeGreaterThan(alpha?.total ?? 0);
  });

  it('sums the three members and keys the result by team id', () => {
    const entries = [
      entry('s', 'team-a', 'Alpha', 'squat'),
      entry('b', 'team-a', 'Alpha', 'bench'),
      entry('d', 'team-a', 'Alpha', 'deadlift'),
    ];
    const attempts = attemptsMap([
      attempt({ entryId: 's', lift: 'squat', attemptNumber: 1, weightKg: 250, result: 'good_lift' }),
      attempt({ entryId: 'b', lift: 'bench', attemptNumber: 1, weightKg: 150, result: 'good_lift' }),
      attempt({ entryId: 'd', lift: 'deadlift', attemptNumber: 1, weightKg: 300, result: 'good_lift' }),
    ]);

    const standings = computeBoardTeamStandings(attempts, entries, 'classic');
    expect([...standings.keys()]).toEqual(['team-a']);
    expect(standings.get('team-a')?.members).toHaveLength(3);
    expect(standings.get('team-a')?.total).toBeGreaterThan(0);
  });

  it('ignores entries with no team or no assigned lift', () => {
    const entries = [
      entry('member', 'team-a', 'Alpha', 'squat'),
      entry('loner', 'team-a', 'Alpha', 'bench', { teamId: null }),
      entry('untagged', 'team-a', 'Alpha', 'deadlift', { teamLift: null }),
    ];
    const attempts = attemptsMap([
      attempt({ entryId: 'member', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
    ]);

    const standings = computeBoardTeamStandings(attempts, entries, 'classic');
    expect([...standings.keys()]).toEqual(['team-a']);
    expect(standings.get('team-a')?.members).toHaveLength(1);
  });

  it('tolerates a missing team name and an unweighed member (no bodyweight)', () => {
    const entries = [entry('m', 'team-a', '', 'squat', { teamName: null, bodyweightKg: null })];
    const attempts = attemptsMap([
      attempt({ entryId: 'm', lift: 'squat', attemptNumber: 1, weightKg: 200, result: 'good_lift' }),
    ]);

    const standings = computeBoardTeamStandings(attempts, entries, 'classic');
    const team = standings.get('team-a');
    expect(team?.name).toBe('');
    // No bodyweight means ipfGlPoints scores 0, so the team has no points yet.
    expect(team?.total).toBe(0);
  });
});
