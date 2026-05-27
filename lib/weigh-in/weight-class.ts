// Bodyweight vs weight class checks for the weigh-in screen. IPF classes use an exclusive lower
// bound and an inclusive upper bound (e.g. the -66 kg class is 59 < bw <= 66); a null upper bound is
// the unlimited top class. A bodyweight on a boundary belongs to the lower class.

export type WeightClassBounds = {
  id: string;
  name: string;
  lowerKg: number;
  upperKg: number | null;
};

export function isBodyweightInClass(bodyweightKg: number, weightClass: WeightClassBounds): boolean {
  if (bodyweightKg <= weightClass.lowerKg) {
    return false;
  }
  if (weightClass.upperKg !== null && bodyweightKg > weightClass.upperKg) {
    return false;
  }
  return true;
}

// The class a bodyweight belongs in, from a gender-filtered list. Returns null when nothing matches
// (e.g. a bodyweight at or below the lightest class's lower bound).
export function findWeightClassForBodyweight(
  bodyweightKg: number,
  classes: readonly WeightClassBounds[],
): WeightClassBounds | null {
  return classes.find((weightClass) => isBodyweightInClass(bodyweightKg, weightClass)) ?? null;
}
