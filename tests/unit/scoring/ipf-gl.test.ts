import { describe, expect, it } from 'vitest';
import { ipfGlPoints, teamGlScore } from '@/lib/scoring/ipf-gl';

describe('ipfGlPoints', () => {
  // End-to-end oracle from the official IPF formula worked example: a male classic lifter at
  // 82.5 kg bodyweight with a 550 kg total scores 76.37. Validates coefficients and formula
  // together, not just against themselves.
  it('matches the official worked example (male classic, 82.5 kg, 550 kg → 76.37)', () => {
    expect(ipfGlPoints({ sex: 'male', kitType: 'classic', bodyweightKg: 82.5, liftedKg: 550 })).toBeCloseTo(76.37, 2);
  });

  it('scores female classic', () => {
    expect(ipfGlPoints({ sex: 'female', kitType: 'classic', bodyweightKg: 60, liftedKg: 300 })).toBeCloseTo(67.81, 2);
  });

  it('scores male equipped', () => {
    expect(ipfGlPoints({ sex: 'male', kitType: 'equipped', bodyweightKg: 100, liftedKg: 900 })).toBeCloseTo(94.12, 2);
  });

  it('scores female equipped', () => {
    expect(ipfGlPoints({ sex: 'female', kitType: 'equipped', bodyweightKg: 75, liftedKg: 450 })).toBeCloseTo(74.28, 2);
  });

  it('returns 0 for a non-positive lift (bombed out)', () => {
    expect(ipfGlPoints({ sex: 'male', kitType: 'classic', bodyweightKg: 90, liftedKg: 0 })).toBe(0);
  });

  it('returns 0 for a non-positive bodyweight', () => {
    expect(ipfGlPoints({ sex: 'female', kitType: 'classic', bodyweightKg: 0, liftedKg: 200 })).toBe(0);
  });

  it('returns 0 when the model denominator is non-positive (implausibly low bodyweight)', () => {
    expect(ipfGlPoints({ sex: 'female', kitType: 'classic', bodyweightKg: 10, liftedKg: 100 })).toBe(0);
  });

  it('is monotonic in the lifted weight', () => {
    const lighter = ipfGlPoints({ sex: 'male', kitType: 'classic', bodyweightKg: 90, liftedKg: 600 });
    const heavier = ipfGlPoints({ sex: 'male', kitType: 'classic', bodyweightKg: 90, liftedKg: 700 });
    expect(heavier).toBeGreaterThan(lighter);
  });
});

describe('teamGlScore', () => {
  it('sums the three members’ GL points from their best lifts', () => {
    const score = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 80, bestLiftKg: 260 },
      { sex: 'female', kitType: 'classic', bodyweightKg: 60, bestLiftKg: 110 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 100, bestLiftKg: 300 },
    ]);
    expect(score).toBeCloseTo(99.43, 2);
  });

  it('counts a member with no good lift as zero', () => {
    const withBomb = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 80, bestLiftKg: 260 },
      { sex: 'female', kitType: 'classic', bodyweightKg: 60, bestLiftKg: 0 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 100, bestLiftKg: 300 },
    ]);
    const soloPair = teamGlScore([
      { sex: 'male', kitType: 'classic', bodyweightKg: 80, bestLiftKg: 260 },
      { sex: 'male', kitType: 'classic', bodyweightKg: 100, bestLiftKg: 300 },
    ]);
    expect(withBomb).toBeCloseTo(soloPair, 2);
  });

  it('is 0 for an empty team', () => {
    expect(teamGlScore([])).toBe(0);
  });
});
