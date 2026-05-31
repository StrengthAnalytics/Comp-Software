import type { Database } from '@/types/database.types';
import { ATTEMPTS_PER_LIFT } from '@/lib/constants';
import { bestGoodLift } from '@/lib/attempts/best-lift';
import { ipfGlPoints, type KitType } from '@/lib/scoring/ipf-gl';
import { attemptKey } from '@/lib/realtime/use-board-state';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];

// Attempt numbers 1..3 (CLAUDE.md: three attempts per lift), derived so the literal lives once.
const ATTEMPT_NUMBERS = Array.from({ length: ATTEMPTS_PER_LIFT }, (_, index) => index + 1);

// The best successful lift (kg) for one entry + lift, read from the board's attempts map (keyed by the
// natural entry/lift/attempt key). 0 when the lifter has no good lift in that lift. Single-sources the
// per-lift "best" the run screen, warm-up board and overlay all show, so the cell value can't drift.
export function bestLiftFor(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entryId: string,
  lift: LiftType,
): number {
  return bestGoodLift(
    ATTEMPT_NUMBERS.map((attemptNumber) => attempts.get(attemptKey(entryId, lift, attemptNumber)))
      .filter((attempt): attempt is BoardAttempt => attempt !== undefined)
      .map((attempt) => ({ result: attempt.result, weightKg: attempt.weightKg })),
  );
}

// The best *predicted* lift (kg) for one entry + lift: the heaviest attempt that is either already a
// good lift or still in play — pending with a declared weight (not yet judged). A missed (no_lift),
// not-taken or withdrawn attempt is ignored, and an undeclared one has no weight, so this is "the
// heaviest the lifter is currently set to make in this lift if they get what's loaded/declared". 0
// when nothing is in play. This is the projection GoodLift/LiftingCast show: a declared-but-untaken
// third deadlift counts here until it is judged, then it either becomes the (good) best or drops out.
export function predictedBestLiftFor(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entryId: string,
  lift: LiftType,
): number {
  let best = 0;
  for (const attemptNumber of ATTEMPT_NUMBERS) {
    const attempt = attempts.get(attemptKey(entryId, lift, attemptNumber));
    if (!attempt || attempt.weightKg === null) {
      continue;
    }
    const inPlay = attempt.result === 'good_lift' || attempt.result === 'pending';
    if (inPlay && attempt.weightKg > best) {
      best = attempt.weightKg;
    }
  }
  return best;
}

export type PredictedScore = {
  // Sum of each contributing lift's predicted best — the projected final total if the lifter makes
  // their currently-declared attempts. 0 when any contributing lift has nothing in play, since a
  // lifter who can no longer make a lift (bombed, with no pending attempt) cannot total.
  predictedTotal: number;
  // IPF GL points from the predicted total and the weigh-in bodyweight; 0 with no predicted total or
  // before weigh-in. Full-power coefficients via the comp's kit type, matching computeEntryScore.
  predictedGlPoints: number;
};

// The entry's *predicted* score — projected total and IPF GL — from the in-play attempts (good lifts
// plus declared-but-unjudged attempts). Mirrors computeEntryScore but on the prediction: the total is
// only counted once every contributing lift has a value in play (a bombed lift with nothing pending
// means no predicted total), so the predicted standings only rank lifters still on course to total.
export function computePredictedScore(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entry: BoardEntry,
  columnLifts: readonly LiftType[],
  kitType: KitType,
  isTeamCompetition: boolean,
): PredictedScore {
  const lifts = contributingLifts(entry, columnLifts, isTeamCompetition);
  const predictedBests = lifts.map((lift) => predictedBestLiftFor(attempts, entry.id, lift));
  // Every contributing lift must have something in play to project a total.
  const totals = predictedBests.every((best) => best > 0) ? predictedBests : [];
  const predictedTotal = totals.reduce((sum, best) => sum + best, 0);
  const predictedGlPoints =
    predictedTotal > 0
      ? ipfGlPoints({ sex: entry.sex, kitType, bodyweightKg: entry.bodyweightKg ?? 0, liftedKg: predictedTotal })
      : 0;
  return { predictedTotal, predictedGlPoints };
}

// The lifts that count toward an entry's total: in a team comp each member contests only their one
// assigned lift, so just that; otherwise every contested lift of the comp.
export function contributingLifts(
  entry: Pick<BoardEntry, 'teamLift'>,
  columnLifts: readonly LiftType[],
  isTeamCompetition: boolean,
): LiftType[] {
  return isTeamCompetition && entry.teamLift ? [entry.teamLift] : [...columnLifts];
}

export type EntryScore = {
  // Each contributing lift the entry has a good lift in, with that best weight (lifts with no good
  // lift are omitted). Ordered as columnLifts (team comps: the single assigned lift).
  bestLifts: { lift: LiftType; weight: number }[];
  // Sum of the best lifts = the entry's current total (best squat + bench + deadlift, or the one
  // assigned lift for a team member). 0 before any good lift.
  total: number;
  // IPF GL points from that total and the weigh-in bodyweight; 0 with no good lifts or before
  // weigh-in (renders as a dash). Full-power coefficients via the comp's kit type.
  glPoints: number;
};

// The entry's live score bundle — best lifts, total and IPF GL points — derived from the board's
// attempts map. Single-sources the team-vs-individual lift selection, the total, and the GL call that
// the run screen, warm-up board and lifter overlay each render, so a future scoring change is made in
// one place and the three surfaces can never disagree about a lifter's total/points.
export function computeEntryScore(
  attempts: ReadonlyMap<string, BoardAttempt>,
  entry: BoardEntry,
  columnLifts: readonly LiftType[],
  kitType: KitType,
  isTeamCompetition: boolean,
): EntryScore {
  const bestLifts = contributingLifts(entry, columnLifts, isTeamCompetition)
    .map((lift) => ({ lift, weight: bestLiftFor(attempts, entry.id, lift) }))
    .filter((best) => best.weight > 0);
  const total = bestLifts.reduce((sum, best) => sum + best.weight, 0);
  const glPoints =
    total > 0
      ? ipfGlPoints({ sex: entry.sex, kitType, bodyweightKg: entry.bodyweightKg ?? 0, liftedKg: total })
      : 0;
  return { bestLifts, total, glPoints };
}
