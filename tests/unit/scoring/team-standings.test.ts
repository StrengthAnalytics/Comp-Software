import { describe, expect, it } from 'vitest';
import { computeTeamStandings, type StandingTeamInput } from '@/lib/scoring/team-standings';

// One full-power male member at 82.5 kg bodyweight lifting 550 kg scores 76.37 GL (the IPF oracle).
function maleMember(lift: 'squat' | 'bench' | 'deadlift', best: number) {
  return { lift, lifterName: 'X', sex: 'male' as const, bodyweightKg: 82.5, bestLiftKg: best };
}

describe('computeTeamStandings', () => {
  it('sums each team’s member GL points and ranks by total', () => {
    const teams: StandingTeamInput[] = [
      { teamId: 'b', name: 'Bravo', members: [maleMember('squat', 500)] },
      { teamId: 'a', name: 'Alpha', members: [maleMember('squat', 550)] },
    ];
    const standings = computeTeamStandings(teams, 'classic');

    expect(standings[0].name).toBe('Alpha');
    expect(standings[0].rank).toBe(1);
    expect(standings[0].total).toBeCloseTo(76.37, 2);
    expect(standings[1].name).toBe('Bravo');
    expect(standings[1].rank).toBe(2);
    expect(standings[0].total).toBeGreaterThan(standings[1].total);
  });

  it('adds the three members’ points into the team total', () => {
    const [standing] = computeTeamStandings(
      [{ teamId: 'a', name: 'Alpha', members: [maleMember('squat', 250), maleMember('bench', 150), maleMember('deadlift', 300)] }],
      'classic',
    );
    const sum = standing.members.reduce((total, member) => total + member.points, 0);
    expect(standing.total).toBeCloseTo(sum, 2);
    expect(standing.members).toHaveLength(3);
  });

  it('gives a member with no good lift zero points', () => {
    const [standing] = computeTeamStandings(
      [{ teamId: 'a', name: 'Alpha', members: [maleMember('squat', 0)] }],
      'classic',
    );
    expect(standing.members[0].points).toBe(0);
    expect(standing.total).toBe(0);
  });

  it('lets tied teams share a rank and skips the next', () => {
    const teams: StandingTeamInput[] = [
      { teamId: 'a', name: 'Alpha', members: [maleMember('squat', 550)] },
      { teamId: 'b', name: 'Bravo', members: [maleMember('squat', 550)] },
      { teamId: 'c', name: 'Charlie', members: [maleMember('squat', 500)] },
    ];
    const standings = computeTeamStandings(teams, 'classic');
    expect(standings.map((team) => team.rank)).toEqual([1, 1, 3]);
  });
});
