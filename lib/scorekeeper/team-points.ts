import type { Database } from '@/types/database.types';
import { teamGlScore, type KitType } from '@/lib/scoring/ipf-gl';
import { bestLiftFor, predictedBestLiftFor } from '@/lib/scorekeeper/entry-score';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];

// A team's actual and predicted IPF GL points for the run/warm-up boards. Actual sums each member's
// GL from their best good lift; predicted sums it from their predicted best (good lift or a declared,
// unjudged attempt). Both go through the shared teamGlScore so a team's points are summed and rounded
// the same way as the public team-standings page. Returns a map keyed by team id, so each member row
// can show its team's two figures.
export type TeamPoints = { actual: number; predicted: number };

export function computeTeamPoints(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entries: readonly BoardEntry[],
  kitType: KitType,
): Map<string, TeamPoints> {
  // Group the team members (entries tagged with a team and an assigned lift) by team. The lift is
  // narrowed here so the GL builders below don't re-assert it.
  const membersByTeam = new Map<string, { entry: BoardEntry; lift: LiftType }[]>();
  for (const entry of entries) {
    if (!entry.teamId || !entry.teamLift) {
      continue;
    }
    const member = { entry, lift: entry.teamLift };
    const existing = membersByTeam.get(entry.teamId);
    if (existing) {
      existing.push(member);
    } else {
      membersByTeam.set(entry.teamId, [member]);
    }
  }

  const points = new Map<string, TeamPoints>();
  for (const [teamId, members] of membersByTeam) {
    const sum = (bestFor: (entryId: string, lift: LiftType) => number): number =>
      teamGlScore(
        members.map(({ entry, lift }) => ({
          sex: entry.sex,
          kitType,
          bodyweightKg: entry.bodyweightKg ?? 0,
          bestLiftKg: bestFor(entry.id, lift),
        })),
      );
    points.set(teamId, {
      actual: sum((entryId, lift) => bestLiftFor(attempts, entryId, lift)),
      predicted: sum((entryId, lift) => predictedBestLiftFor(attempts, entryId, lift)),
    });
  }
  return points;
}
