import { computeTeamStandings, type StandingTeamInput, type TeamStanding } from '@/lib/scoring/team-standings';
import { bestLiftFor, predictedBestLiftFor } from '@/lib/scorekeeper/entry-score';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';
import type { KitType } from '@/lib/scoring/ipf-gl';

// Bridges the live board (entries + attempts) into the shared team-standings scorer, so the run and
// warm-up boards rank teams — by actual and predicted points — through the exact same
// `computeTeamStandings` the public results page uses, and can't drift from it.

// Projects the team members on the board into the scorer's per-team input: each member's best good
// lift (actual) and best in-play lift (predicted) read from the live attempts via the shared helpers.
export function buildTeamStandingInputs(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entries: readonly BoardEntry[],
): StandingTeamInput[] {
  const byTeam = new Map<string, StandingTeamInput>();
  for (const entry of entries) {
    if (!entry.teamId || !entry.teamLift) {
      continue;
    }
    const lift = entry.teamLift;
    const team = byTeam.get(entry.teamId) ?? { teamId: entry.teamId, name: entry.teamName ?? '', members: [] };
    team.members.push({
      lift,
      lifterName: entry.lifterName,
      sex: entry.sex,
      bodyweightKg: entry.bodyweightKg ?? 0,
      bestLiftKg: bestLiftFor(attempts, entry.id, lift),
      predictedBestLiftKg: predictedBestLiftFor(attempts, entry.id, lift),
    });
    byTeam.set(entry.teamId, team);
  }
  return [...byTeam.values()];
}

// The full team standings (actual + predicted points and ranks) keyed by team id, so each member row
// on the board can show its team's points and place.
export function computeBoardTeamStandings(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entries: readonly BoardEntry[],
  kitType: KitType,
): Map<string, TeamStanding> {
  const standings = computeTeamStandings(buildTeamStandingInputs(attempts, entries), kitType);
  return new Map(standings.map((standing) => [standing.teamId, standing]));
}
