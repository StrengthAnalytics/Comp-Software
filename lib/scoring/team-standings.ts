import { ipfGlPoints, teamGlScore, type KitType, type Sex } from '@/lib/scoring/ipf-gl';
import { TEAM_LIFTS, type TeamLift } from '@/types/team';

// Team standings for a team competition: each member's best lift becomes IPF GL points, the three
// add up to the team total, and teams rank by that total. Pure — the page gathers the data (best
// good lift per member, bodyweights, sexes) and this turns it into a ranked table.

export type StandingMemberInput = {
  lift: TeamLift;
  lifterName: string;
  sex: Sex;
  bodyweightKg: number; // 0 when not weighed in
  bestLiftKg: number; // 0 when the member has no good lift
  // Heaviest in-play lift (best good lift, or a declared-but-unjudged attempt), for the projected
  // total. 0 when nothing is in play. Equals bestLiftKg when the member has no pending heavier attempt.
  predictedBestLiftKg: number;
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
  // The member's projected contribution if they make their declared attempts.
  predictedBestLiftKg: number;
  predictedPoints: number;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  total: number;
  // The team's projected total if every member makes their currently-declared attempts. Always ≥
  // total. The list stays ranked by the actual total; predicted is shown alongside as guidance.
  predictedTotal: number;
  rank: number;
  // The team's rank by predicted total (ties share, next skips), so a surface can show where a team
  // would place if the current attempts are made. Independent of the actual-total `rank`.
  predictedRank: number;
  members: StandingMember[];
};

export function computeTeamStandings(teams: StandingTeamInput[], kitType: KitType): TeamStanding[] {
  const scored = teams.map((team) => {
    // Members read top-to-bottom in lift order — squat, then bench, then deadlift — regardless of the
    // order the caller gathered them in.
    const members: StandingMember[] = team.members
      .map((member) => ({
        lift: member.lift,
        lifterName: member.lifterName,
        bestLiftKg: member.bestLiftKg,
        points: ipfGlPoints({ sex: member.sex, kitType, bodyweightKg: member.bodyweightKg, liftedKg: member.bestLiftKg }),
        predictedBestLiftKg: member.predictedBestLiftKg,
        predictedPoints: ipfGlPoints({
          sex: member.sex,
          kitType,
          bodyweightKg: member.bodyweightKg,
          liftedKg: member.predictedBestLiftKg,
        }),
      }))
      .toSorted((a, b) => TEAM_LIFTS.indexOf(a.lift) - TEAM_LIFTS.indexOf(b.lift));
    // teamGlScore owns the team-GL sum and its rounding, so the public standings, the run screen and
    // the overlays can never aggregate or round a team's score differently. The actual total uses each
    // member's best good lift; the predicted total uses their best in-play lift instead.
    const total = teamGlScore(
      team.members.map((member) => ({
        sex: member.sex,
        kitType,
        bodyweightKg: member.bodyweightKg,
        bestLiftKg: member.bestLiftKg,
      })),
    );
    const predictedTotal = teamGlScore(
      team.members.map((member) => ({
        sex: member.sex,
        kitType,
        bodyweightKg: member.bodyweightKg,
        bestLiftKg: member.predictedBestLiftKg,
      })),
    );
    // predictedRank is filled in below (every team is ranked), so the 0 placeholder never survives.
    return { teamId: team.teamId, name: team.name, total, predictedTotal, members, predictedRank: 0 };
  });

  const ordered = scored.toSorted((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Rank by predicted total too (same standard-competition ranking), so a team's projected place can
  // be shown independently of where it sits on the actual total. Written onto the shared scored
  // objects (toSorted keeps the same element references), so the actual-total pass below reads it.
  const predictedOrder = scored.toSorted((a, b) => b.predictedTotal - a.predictedTotal || a.name.localeCompare(b.name));
  let previousPredictedTotal: number | null = null;
  let previousPredictedRank = 0;
  for (const [index, team] of predictedOrder.entries()) {
    const rank = previousPredictedTotal !== null && team.predictedTotal === previousPredictedTotal ? previousPredictedRank : index + 1;
    previousPredictedTotal = team.predictedTotal;
    previousPredictedRank = rank;
    team.predictedRank = rank;
  }

  // Standard competition ranking: equal totals share a rank, and the next rank skips accordingly.
  let previousTotal: number | null = null;
  let previousRank = 0;
  return ordered.map((team, index) => {
    const rank = previousTotal !== null && team.total === previousTotal ? previousRank : index + 1;
    previousTotal = team.total;
    previousRank = rank;
    return {
      teamId: team.teamId,
      name: team.name,
      total: team.total,
      predictedTotal: team.predictedTotal,
      rank,
      predictedRank: team.predictedRank,
      members: team.members,
    };
  });
}
