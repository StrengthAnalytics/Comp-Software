'use client';

import type { Database } from '@/types/database.types';
import type { IpfPlateWeight } from '@/lib/constants';
import { formatPlatesPerSide, platesPerSide, type PlateBreakdown } from '@/lib/plates/plate-math';
import { liftHasRack, rackText } from '@/lib/scorekeeper/board-format';
import type { BoardEntry } from '@/lib/scorekeeper/board-types';
import { PLATE_STYLE } from '@/components/plates/plate-style';

type LiftType = Database['public']['Enums']['lift_type'];

// Mini plate heights for the up-next cards, keyed by denomination — a small echo of the loading
// display's plate diagram. Same canonical-list typing as PLATE_STYLE: every IPF plate must have a
// height, enforced at compile time.
const MINI_PLATE_HEIGHT: Record<IpfPlateWeight, string> = {
  25: 'h-10',
  20: 'h-9',
  15: 'h-8',
  10: 'h-7',
  5: 'h-6',
  2.5: 'h-5',
  1.25: 'h-5',
  0.5: 'h-4',
  0.25: 'h-4',
};

// The optional "how to load it" detail on a warm-up up-next card: the lifter's rack settings for the
// lift (squat/bench only — deadlift has none) and a compact IPF-coloured plate diagram + per-side text
// for the declared weight — a smaller echo of the loading-crew display, so a warming-up lifter or the
// warm-up room crew can see their rack heights and the plates without the platform screen. Reuses the
// shared rackText, platesPerSide and plate colours, so it can't disagree with the loading display.
export function UpNextDetail({
  entry,
  lift,
  weightKg,
}: {
  entry: BoardEntry;
  lift: LiftType;
  weightKg: number | null;
}) {
  const breakdown = weightKg === null ? null : platesPerSide(weightKg);
  return (
    // Divider sits above when the card stacks (top border) and to the left when it sits beside the
    // identity (left border) — driven by the card's container query, set on the PositionCard ancestor.
    <div className="min-w-0 space-y-2 border-t border-neutral-200 pt-2 @sm:border-t-0 @sm:border-l @sm:pt-0 @sm:pl-4">
      {liftHasRack(lift) ? (
        <p className="text-sm text-neutral-600">
          <span className="font-semibold uppercase tracking-wide text-neutral-500">Rack </span>
          <span className="font-medium tabular-nums text-neutral-800">{rackText(entry, lift)}</span>
        </p>
      ) : null}
      {breakdown ? <MiniPlateStack breakdown={breakdown} /> : null}
    </div>
  );
}

function MiniPlateStack({ breakdown }: { breakdown: PlateBreakdown }) {
  // A weight at or below the bar+collars carries no plates — "Bar only" rather than the unloadable
  // error (which is for weights above the bar the plate set can't make exactly).
  if (breakdown.perSideKg === 0) {
    return <p className="text-sm font-medium text-neutral-500">Bar only</p>;
  }
  if (!breakdown.loadable) {
    return <p className="text-sm font-medium text-red-600">Cannot load {breakdown.totalKg} kg with available plates</p>;
  }
  const bars = breakdown.plates.flatMap((plate) =>
    Array.from({ length: plate.count }, (_, index) => ({ weightKg: plate.weightKg, index })),
  );
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-1">
        {bars.map((bar) => {
          // platesPerSide only ever emits IPF_PLATE_WEIGHTS_KG denominations, so the weight is always a
          // key of the (compile-time-complete) height/colour maps — the cast is safe.
          const weight = bar.weightKg as IpfPlateWeight;
          return (
            <div
              key={`${bar.weightKg}-${bar.index}`}
              className={`w-3 rounded-sm ${MINI_PLATE_HEIGHT[weight]} ${PLATE_STYLE[weight]}`}
            />
          );
        })}
      </div>
      <p className="text-xs text-neutral-600">
        <span className="font-semibold tabular-nums">{formatPlatesPerSide(breakdown.plates)}</span> / side
      </p>
    </div>
  );
}
