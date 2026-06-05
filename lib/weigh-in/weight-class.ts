// Bodyweight vs weight class checks for the weigh-in screen. IPF classes are inclusive on both
// bounds, with each class's lower bound set to the class below's upper bound + 0.01 kg (so the seeded
// -83 class is 74.01–83.00 and -93 is 83.01–93.00). Bodyweights are stored to 2 dp, so a lifter at
// 83.00 kg is -83 and one at 83.01 kg is -93 (too heavy for -83). A null upper bound is the unlimited
// top class; the lightest class has a lower bound of 0, catching every lighter lifter.

export type WeightClassBounds = {
  id: string;
  name: string;
  lowerKg: number;
  upperKg: number | null;
};

export function isBodyweightInClass(bodyweightKg: number, weightClass: WeightClassBounds): boolean {
  if (bodyweightKg < weightClass.lowerKg) {
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
