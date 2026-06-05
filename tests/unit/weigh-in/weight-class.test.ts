import { describe, expect, it } from 'vitest';
import {
  findWeightClassForBodyweight,
  isBodyweightInClass,
  type WeightClassBounds,
} from '@/lib/weigh-in/weight-class';

// Inclusive bounds, each lower set to the class below's upper + 0.01 (the seeded representation).
const classes: WeightClassBounds[] = [
  { id: 'c59', name: '-59 kg', lowerKg: 0, upperKg: 59 },
  { id: 'c66', name: '-66 kg', lowerKg: 59.01, upperKg: 66 },
  { id: 'c120', name: '-120 kg', lowerKg: 105.01, upperKg: 120 },
  { id: 'cSHW', name: '120 kg+', lowerKg: 120.01, upperKg: null },
];

describe('isBodyweightInClass', () => {
  it('accepts a bodyweight inside the bounds', () => {
    expect(isBodyweightInClass(63, { id: 'x', name: '-66', lowerKg: 59.01, upperKg: 66 })).toBe(true);
  });

  it('treats the upper bound as inclusive', () => {
    expect(isBodyweightInClass(66, { id: 'x', name: '-66', lowerKg: 59.01, upperKg: 66 })).toBe(true);
  });

  it('treats the lower bound as inclusive (lower = class-below upper + 0.01)', () => {
    // 59.00 belongs to -59 (its upper), 59.01 to -66 (its lower).
    expect(isBodyweightInClass(59, { id: 'x', name: '-66', lowerKg: 59.01, upperKg: 66 })).toBe(false);
    expect(isBodyweightInClass(59, { id: 'y', name: '-59', lowerKg: 0, upperKg: 59 })).toBe(true);
    expect(isBodyweightInClass(59.01, { id: 'x', name: '-66', lowerKg: 59.01, upperKg: 66 })).toBe(true);
  });

  it('treats a null upper bound as unlimited', () => {
    expect(isBodyweightInClass(150, { id: 'z', name: '120+', lowerKg: 120.01, upperKg: null })).toBe(true);
    expect(isBodyweightInClass(120, { id: 'z', name: '120+', lowerKg: 120.01, upperKg: null })).toBe(false);
  });
});

describe('findWeightClassForBodyweight', () => {
  it('finds the class a bodyweight belongs in', () => {
    expect(findWeightClassForBodyweight(63, classes)?.id).toBe('c66');
  });

  it('puts an exact-upper bodyweight in that class, and 0.01 above it in the next', () => {
    expect(findWeightClassForBodyweight(120, classes)?.id).toBe('c120');
    expect(findWeightClassForBodyweight(120.01, classes)?.id).toBe('cSHW');
  });

  it('routes a 2 dp boundary to a single class (83.00 → -83, 83.01 → -93)', () => {
    const menMiddle: WeightClassBounds[] = [
      { id: 'c83', name: '-83 kg', lowerKg: 74.01, upperKg: 83 },
      { id: 'c93', name: '-93 kg', lowerKg: 83.01, upperKg: 93 },
    ];
    expect(findWeightClassForBodyweight(83, menMiddle)?.id).toBe('c83');
    expect(findWeightClassForBodyweight(83.01, menMiddle)?.id).toBe('c93');
    // No bodyweight matches two classes.
    expect(menMiddle.filter((weightClass) => isBodyweightInClass(83, weightClass))).toHaveLength(1);
  });

  it('returns the unlimited class above the top bound', () => {
    expect(findWeightClassForBodyweight(140, classes)?.id).toBe('cSHW');
  });

  it('returns null when nothing matches (below the lightest provided class)', () => {
    const withoutLightest = classes.slice(1); // lightest provided is now -66 (lower 59.01)
    expect(findWeightClassForBodyweight(50, withoutLightest)).toBeNull();
  });
});
