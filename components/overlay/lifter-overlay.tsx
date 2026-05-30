'use client';

import { useMemo } from 'react';
import type { Database } from '@/types/database.types';
import { KG_TO_LBS, LIFT_LABELS, type Lifts } from '@/lib/constants';
import type { KitType } from '@/lib/scoring/ipf-gl';
import { attemptKey, useBoardState } from '@/lib/realtime/use-board-state';
import { buildPlatformLiveView } from '@/lib/scorekeeper/platform-live-view';
import { computeEntryScore } from '@/lib/scorekeeper/entry-score';
import type {
  BoardAttempt,
  BoardEntry,
  BoardFlight,
  BoardSession,
  NamedOption,
} from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];

type LifterOverlayProps = {
  competitionId: string;
  platformId: string;
  isTeamCompetition: boolean;
  kitType: KitType;
  lifts: Lifts;
  sessions: BoardSession[];
  flights: BoardFlight[];
  weightClasses: NamedOption[];
  divisions: NamedOption[];
  teams: NamedOption[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// What the lower-third card shows for the lifter currently on the platform — fully derived, so the
// overlay never needs its own data plumbing beyond the board snapshot/subscriptions.
type CurrentLifter = {
  key: string;
  lifterName: string;
  subtitle: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  flightName: string;
  bestLifts: { lift: LiftType; weight: number }[];
  total: number;
  glPoints: number;
};

// The on-platform lifter lower-third: an OBS browser-source overlay (transparent background) that
// names the lifter currently on the platform, their category, the attempt being lifted (lift + round +
// weight) and their best lifts/total so far. It reads the same live board state as the run screen and
// warm-up board (attempts/entries/flights, scoped to the competition) and derives the current lifter
// through the shared buildPlatformLiveView, so it can never disagree with the head table about who is
// up. Read-only: it never mutates. Scoped to one platform via the page's `?platform=`.
export function LifterOverlay({
  competitionId,
  platformId,
  isTeamCompetition,
  kitType,
  lifts,
  sessions,
  flights: initialFlights,
  weightClasses,
  divisions,
  teams,
  entries: initialEntries,
  attempts: initialAttempts,
}: LifterOverlayProps) {
  const { attempts, entries, flights } = useBoardState({
    competitionId,
    initialAttempts,
    initialEntries,
    initialFlights,
    weightClasses,
    divisions,
    teams,
  });

  const columnLifts = useMemo(
    // The literal array is exactly the lift_type members, so narrowing it to LiftType[] is sound.
    () => (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => lifts[lift]),
    [lifts],
  );

  const current = useMemo<CurrentLifter | null>(() => {
    const { positions } = buildPlatformLiveView({
      platformId,
      sessions,
      flights,
      entries,
      attempts: attempts.values(),
    });
    const onPlatform = positions.onPlatform;
    if (!onPlatform) {
      return null;
    }
    const entry = onPlatform.entry;

    // Best lifts / total / IPF GL through the shared entry-score helper, so the overlay can't drift
    // from the run screen and warm-up board on what a lifter's total or points are.
    const { bestLifts, total, glPoints } = computeEntryScore(attempts, entry, columnLifts, kitType, isTeamCompetition);

    // Category line: weight class · division for an individual comp, or the team name for a team comp.
    const subtitle = isTeamCompetition
      ? (entry.teamName ?? '')
      : [entry.weightClassName, entry.divisionName].filter(Boolean).join(' · ');

    return {
      key: attemptKey(entry.id, onPlatform.lift, onPlatform.attemptNumber),
      lifterName: entry.lifterName,
      subtitle,
      lift: onPlatform.lift,
      attemptNumber: onPlatform.attemptNumber,
      weightKg: onPlatform.weightKg,
      flightName: onPlatform.flight.name,
      bestLifts,
      total,
      glPoints,
    };
  }, [platformId, sessions, flights, entries, attempts, isTeamCompetition, columnLifts, kitType]);

  // A fixed 1920×1080 canvas keeps the layout pixel-stable regardless of the OBS browser-source size
  // (set the source to 1920×1080). Everything outside the card stays transparent so the livestream
  // shows through; only the card paints. With no lifter on the platform the overlay renders nothing.
  return (
    <div
      aria-live="polite"
      aria-label="Current lifter"
      className="relative h-[1080px] w-[1920px] overflow-hidden"
    >
      {current ? <LifterCard key={current.key} current={current} /> : null}
    </div>
  );
}

// The lower-third card itself. Re-mounted via a React key on the on-platform attempt, so each new
// lifter/attempt slides up fresh (animation defined in globals.css). LiftingCast-style: bottom-left,
// dark translucent panel with a bright accent for the attempt weight.
function LifterCard({ current }: { current: CurrentLifter }) {
  const lbs = current.weightKg === null ? null : Math.round(current.weightKg * KG_TO_LBS);
  return (
    <div className="animate-overlay-rise absolute bottom-16 left-16 flex max-w-[60%] flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-neutral-950/85 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
        <div className="flex items-stretch">
          {/* Name + category block */}
          <div className="flex flex-col justify-center px-8 py-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
              {current.flightName} · {LIFT_LABELS[current.lift]} · Attempt {current.attemptNumber}
            </p>
            <h1 className="mt-1 text-6xl font-black leading-none tracking-tight text-white">
              {current.lifterName}
            </h1>
            {current.subtitle ? (
              <p className="mt-2 text-2xl font-medium text-neutral-300">{current.subtitle}</p>
            ) : null}
          </div>

          {/* Attempt weight block */}
          <div className="flex flex-col items-center justify-center bg-amber-400 px-8 py-6 text-neutral-950">
            <p className="text-xs font-bold uppercase tracking-widest">Attempt</p>
            <p className="text-6xl font-black leading-none tabular-nums">
              {current.weightKg === null ? '—' : current.weightKg}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {current.weightKg === null ? 'kg' : `kg · ${lbs} lb`}
            </p>
          </div>
        </div>

        {/* Best lifts + total strip */}
        {current.bestLifts.length > 0 ? (
          <div className="flex items-center gap-6 border-t border-white/10 bg-black/40 px-8 py-3 text-white">
            {current.bestLifts.map((best) => (
              <div key={best.lift} className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {LIFT_LABELS[best.lift]}
                </span>
                <span className="text-2xl font-bold tabular-nums">{best.weight}</span>
              </div>
            ))}
            <div className="ml-auto flex items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">Total</span>
              <span className="text-2xl font-black tabular-nums text-amber-400">{current.total}</span>
            </div>
            {current.glPoints > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">GL</span>
                <span className="text-2xl font-bold tabular-nums">{current.glPoints.toFixed(2)}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
