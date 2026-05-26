import { ipfGlPoints, type KitType, type Sex } from '@/lib/scoring/ipf-gl';
import type { TeamLift } from '@/types/team';

// Team standings for a team competition: each member's best lift becomes IPF GL points, the three
// add up to the team total, and teams rank by that total. Pure — the page gathers the data (best
// good lift per member, bodyweights, sexes) and this turns it into a ranked table.

export type StandingMemberInput = {
  lift: TeamLift;
  lifterName: string;
  sex: Sex;
  bodyweightKg: number; // 0 when not weighed in
  bestLiftKg: number; // 0 when the member has no good lift
};

export type StandingTeamInput = {
  teamId: string;
  name: string;
  members: StandingMemberInput[];
};

export type StandingMember = {
  lift: TeamLift;
  lifterName: string;
  bestLiftKg: number;
  points: number;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  total: number;
  rank: number;
  members: StandingMember[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeTeamStandings(teams: StandingTeamInput[], kitType: KitType): TeamStanding[] {
  const scored = teams.map((team) => {
    const members: StandingMember[] = team.members.map((member) => ({
      lift: member.lift,
      lifterName: member.lifterName,
      bestLiftKg: member.bestLiftKg,
      points: ipfGlPoints({ sex: member.sex, kitType, bodyweightKg: member.bodyweightKg, liftedKg: member.bestLiftKg }),
    }));
    const total = round2(members.reduce((sum, member) => sum + member.points, 0));
    return { teamId: team.teamId, name: team.name, total, members };
  });

  const ordered = scored.toSorted((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Standard competition ranking: equal totals share a rank, and the next rank skips accordingly.
  let previousTotal: number | null = null;
  let previousRank = 0;
  return ordered.map((team, index) => {
    const rank = previousTotal !== null && team.total === previousTotal ? previousRank : index + 1;
    previousTotal = team.total;
    previousRank = rank;
    return { teamId: team.teamId, name: team.name, total: team.total, rank, members: team.members };
  });
}
