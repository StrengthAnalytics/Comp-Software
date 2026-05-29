import { BAR_AND_COLLARS_KG, IPF_PLATE_WEIGHTS_KG } from '@/lib/constants';

// One denomination of plate and how many go on each side of the bar.
export type PlateCount = { weightKg: number; count: number };

export type PlateBreakdown = {
  // The full bar weight this breakdown loads (the attempt's declared weight).
  totalKg: number;
  // Plates to load on one side, grouped largest-first. The other side mirrors it.
  plates: PlateCount[];
  // Weight of plates on one side = (total − bar & collars) ÷ 2, never negative.
  perSideKg: number;
  // Any per-side weight the available plates could not make exactly (kg). 0 for every legal attempt;
  // non-zero only signals a weight that cannot be loaded with the on-hand plate set.
  leftoverKg: number;
  // True when the total is at least the bar & collars weight and the plates resolve it exactly.
  loadable: boolean;
};

// Plates and per-side maths are done in integer hundredths of a kg, so 0.1 + 0.2 style float drift
// can never make a plate "not quite" divide its remainder. kg values are numeric(5,1) at most, so a
// hundredth is finer than anything stored.
function toHundredths(kg: number): number {
  return Math.round(kg * 100);
}

// Computes the plates to load on each side of the bar for a target total weight, greedily from the
// largest plate down. Pure and unit-tested. Defaults to the house bar & collars weight and the IPF
// plate set, but both are injectable for tests (and any future per-comp configuration).
//
// A total below the bar & collars weight is not loadable (perSideKg 0, no plates). A total the plate
// set cannot make exactly leaves the shortfall in leftoverKg and reports loadable: false, so the UI
// can flag it rather than silently rounding.
export function platesPerSide(
  totalKg: number,
  barAndCollarsKg: number = BAR_AND_COLLARS_KG,
  plateWeightsKg: readonly number[] = IPF_PLATE_WEIGHTS_KG,
): PlateBreakdown {
  const perSideKg = (totalKg - barAndCollarsKg) / 2;
  if (perSideKg <= 0) {
    return {
      totalKg,
      plates: [],
      perSideKg: Math.max(0, perSideKg),
      leftoverKg: 0,
      // Exactly the bar & collars (perSideKg 0) is loadable with no plates; anything lighter is not.
      loadable: perSideKg === 0,
    };
  }

  let remaining = toHundredths(perSideKg);
  const plates: PlateCount[] = [];
  for (const weightKg of plateWeightsKg) {
    const unit = toHundredths(weightKg);
    if (unit <= 0) {
      continue;
    }
    const count = Math.floor(remaining / unit);
    if (count > 0) {
      plates.push({ weightKg, count });
      remaining -= count * unit;
    }
  }

  const leftoverKg = remaining / 100;
  return { totalKg, plates, perSideKg, leftoverKg, loadable: leftoverKg === 0 };
}

// A compact per-side text breakdown, largest plate first, e.g. "25 ×5 · 15 · 2.5". A plate loaded
// once shows just its weight; loaded more than once it shows "×n". Returns an empty string when no
// plates are loaded (a bar at exactly the bar & collars weight).
export function formatPlatesPerSide(plates: readonly PlateCount[]): string {
  return plates
    .map((plate) => (plate.count > 1 ? `${plate.weightKg} ×${plate.count}` : String(plate.weightKg)))
    .join(' · ');
}
