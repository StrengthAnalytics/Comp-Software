import { describe, expect, it } from 'vitest';
import {
  findWeightClassForBodyweight,
  isBodyweightInClass,
  type WeightClassBounds,
} from '@/lib/weigh-in/weight-class';

const classes: WeightClassBounds[] = [
  { id: 'c59', name: '-59 kg', lowerKg: 0, upperKg: 59 },
  { id: 'c66', name: '-66 kg', lowerKg: 59, upperKg: 66 },
  { id: 'c120', name: '-120 kg', lowerKg: 105, upperKg: 120 },
  { id: 'cSHW', name: '120 kg+', lowerKg: 120, upperKg: null },
];

describe('isBodyweightInClass', () => {
  it('accepts a bodyweight inside the bounds', () => {
    expect(isBodyweightInClass(63, { id: 'x', name: '-66', lowerKg: 59, upperKg: 66 })).toBe(true);
  });

  it('treats the upper bound as inclusive', () => {
    expect(isBodyweightInClass(66, { id: 'x', name: '-66', lowerKg: 59, upperKg: 66 })).toBe(true);
  });

  it('treats the lower bound as exclusive (boundary belongs to the lower class)', () => {
    expect(isBodyweightInClass(59, { id: 'x', name: '-66', lowerKg: 59, upperKg: 66 })).toBe(false);
    expect(isBodyweightInClass(59, { id: 'y', name: '-59', lowerKg: 0, upperKg: 59 })).toBe(true);
  });

  it('treats a null upper bound as unlimited', () => {
    expect(isBodyweightInClass(150, { id: 'z', name: '120+', lowerKg: 120, upperKg: null })).toBe(true);
    expect(isBodyweightInClass(120, { id: 'z', name: '120+', lowerKg: 120, upperKg: null })).toBe(false);
  });
});

describe('findWeightClassForBodyweight', () => {
  it('finds the class a bodyweight belongs in', () => {
    expect(findWeightClassForBodyweight(63, classes)?.id).toBe('c66');
  });

  it('puts a boundary bodyweight in the lower class', () => {
    expect(findWeightClassForBodyweight(120, classes)?.id).toBe('c120');
  });

  it('returns the unlimited class above the top bound', () => {
    expect(findWeightClassForBodyweight(140, classes)?.id).toBe('cSHW');
  });

  it('returns null when nothing matches', () => {
    expect(findWeightClassForBodyweight(0, classes)).toBeNull();
  });
});
