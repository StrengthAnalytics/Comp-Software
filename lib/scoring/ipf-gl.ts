// IPF GL Points — the International Powerlifting Federation's "Goodlift" relative-strength score.
//
//   GL = liftedKg * 100 / (A - B * e^(-C * bodyweightKg))
//
// A, B and C are the official IPF 2020 coefficients, keyed by sex and equipment. We use the
// full-power (3-lift) set for every figure we score — including the single squat and the single
// deadlift of a team competition's members. The IPF only publishes GL coefficients for full
// powerlifting and for bench-only, so there is no official single-squat or single-deadlift set;
// scoring all three team roles on the same full-power coefficients keeps the three contributions
// on one comparable scale. Source: https://www.powerlifting.sport/rules/codes/info/ipf-formula

export type Sex = 'male' | 'female';
export type KitType = 'classic' | 'equipped';

type GlCoefficients = { a: number; b: number; c: number };

// Quoted verbatim from the official IPF source so they can be audited against it character for
// character; numeric separators would only obscure that comparison.
/* eslint-disable unicorn/numeric-separators-style */
const FULL_POWER_COEFFICIENTS: Record<KitType, Record<Sex, GlCoefficients>> = {
  classic: {
    male: { a: 1199.72839, b: 1025.18162, c: 0.00921 },
    female: { a: 610.32796, b: 1045.59282, c: 0.03048 },
  },
  equipped: {
    male: { a: 1236.25115, b: 1449.21864, c: 0.01644 },
    female: { a: 758.63878, b: 949.31382, c: 0.02435 },
  },
};
/* eslint-enable unicorn/numeric-separators-style */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type GlInput = {
  sex: Sex;
  kitType: KitType;
  bodyweightKg: number;
  liftedKg: number;
};

// GL points for one lifted figure, rounded to two decimals (as the IPF reports them). Returns 0 for
// a non-positive lift (e.g. a bombed-out lifter with no good attempt) or a non-positive bodyweight.
export function ipfGlPoints({ sex, kitType, bodyweightKg, liftedKg }: GlInput): number {
  if (liftedKg <= 0 || bodyweightKg <= 0) {
    return 0;
  }

  const { a, b, c } = FULL_POWER_COEFFICIENTS[kitType][sex];
  const denominator = a - b * Math.exp(-c * bodyweightKg);

  // The exponential model dips below zero at implausibly low bodyweights; guard so the score is
  // never negative or infinite.
  if (denominator <= 0) {
    return 0;
  }

  return round2((liftedKg * 100) / denominator);
}

export type TeamMemberLift = {
  sex: Sex;
  kitType: KitType;
  bodyweightKg: number;
  // Best successful attempt in the member's assigned lift, in kg; 0 when they recorded no good lift.
  bestLiftKg: number;
};

// A team's score is the sum of its three members' GL points, each from that member's best lift in
// their assigned discipline. A member with no good lift contributes 0.
export function teamGlScore(members: TeamMemberLift[]): number {
  const total = members.reduce(
    (sum, member) =>
      sum +
      ipfGlPoints({
        sex: member.sex,
        kitType: member.kitType,
        bodyweightKg: member.bodyweightKg,
        liftedKg: member.bestLiftKg,
      }),
    0,
  );
  return round2(total);
}
