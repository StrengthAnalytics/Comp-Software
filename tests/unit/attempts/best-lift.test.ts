import { describe, expect, it } from 'vitest';
import { bestGoodLift } from '@/lib/attempts/best-lift';

describe('bestGoodLift', () => {
  it('returns the heaviest good lift', () => {
    expect(
      bestGoodLift([
        { result: 'good_lift', weightKg: 100 },
        { result: 'good_lift', weightKg: 110 },
        { result: 'no_lift', weightKg: 120 },
      ]),
    ).toBe(110);
  });

  it('ignores attempts that were not good lifts', () => {
    expect(
      bestGoodLift([
        { result: 'no_lift', weightKg: 200 },
        { result: 'pending', weightKg: 190 },
        { result: 'withdrawn', weightKg: 180 },
        { result: 'not_taken', weightKg: 170 },
      ]),
    ).toBe(0);
  });

  it('returns 0 for an empty set (bombed-out lifter)', () => {
    expect(bestGoodLift([])).toBe(0);
  });

  it('ignores a good lift with no recorded weight', () => {
    expect(bestGoodLift([{ result: 'good_lift', weightKg: null }])).toBe(0);
  });
});
