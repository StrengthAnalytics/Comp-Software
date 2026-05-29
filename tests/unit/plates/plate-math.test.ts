import { describe, expect, it } from 'vitest';
import { formatPlatesPerSide, platesPerSide } from '@/lib/plates/plate-math';

// Shorthand: the per-side denomination list (largest first), dropping counts.
function denominations(totalKg: number): number[] {
  return platesPerSide(totalKg).plates.flatMap((plate) => Array.from({ length: plate.count }, () => plate.weightKg));
}

describe('platesPerSide', () => {
  it('loads nothing for a bar at exactly the bar & collars weight', () => {
    const result = platesPerSide(25);
    expect(result.plates).toEqual([]);
    expect(result.perSideKg).toBe(0);
    expect(result.loadable).toBe(true);
  });

  it('is not loadable below the bar & collars weight', () => {
    const result = platesPerSide(20);
    expect(result.plates).toEqual([]);
    expect(result.perSideKg).toBe(0);
    expect(result.loadable).toBe(false);
  });

  it('breaks a typical opener into the largest plates first', () => {
    // 310 kg − 25 = 285; 142.5 per side = 25×5 + 15 + 2.5 (matches the LiftingCast reference).
    const result = platesPerSide(310);
    expect(result.perSideKg).toBe(142.5);
    expect(result.plates).toEqual([
      { weightKg: 25, count: 5 },
      { weightKg: 15, count: 1 },
      { weightKg: 2.5, count: 1 },
    ]);
    expect(result.loadable).toBe(true);
    expect(result.leftoverKg).toBe(0);
  });

  it('uses one 25 per side for a 100 kg bar', () => {
    // 100 − 25 = 75; 37.5 per side = 25 + 10 + 2.5.
    expect(denominations(100)).toEqual([25, 10, 2.5]);
  });

  it('resolves a 0.5 kg-granular total with change plates exactly', () => {
    // 125.5 − 25 = 100.5; 50.25 per side = 25 + 20 + 5 + 0.25.
    const result = platesPerSide(125.5);
    expect(result.perSideKg).toBe(50.25);
    expect(result.plates).toEqual([
      { weightKg: 25, count: 2 },
      { weightKg: 0.25, count: 1 },
    ]);
    expect(result.loadable).toBe(true);
    expect(result.leftoverKg).toBe(0);
  });

  it('does not drift on repeated small-plate sums (float safety)', () => {
    // 25 + 0.1*… style drift would corrupt a naive subtraction; integer hundredths keep it exact.
    const result = platesPerSide(25 + 2 * (1.25 + 1.25));
    expect(result.leftoverKg).toBe(0);
    expect(result.loadable).toBe(true);
  });

  it('reports an unloadable remainder when no plate set can make the weight', () => {
    // 0.1 kg per side cannot be made from the IPF set (smallest is 0.25); flag it rather than round.
    const result = platesPerSide(25.2);
    expect(result.loadable).toBe(false);
    expect(result.leftoverKg).toBeGreaterThan(0);
  });

  it('respects an injected bar weight and plate set', () => {
    // 15 kg women's bar + 5 kg collars = 20; 60 − 20 = 40; 20 per side from a 20-only set.
    const result = platesPerSide(60, 20, [20, 10]);
    expect(result.plates).toEqual([{ weightKg: 20, count: 1 }]);
    expect(result.perSideKg).toBe(20);
  });
});

describe('formatPlatesPerSide', () => {
  it('shows a single plate as its weight and repeats as ×n, largest first', () => {
    expect(formatPlatesPerSide(platesPerSide(310).plates)).toBe('25 ×5 · 15 · 2.5');
  });

  it('is empty when no plates are loaded', () => {
    expect(formatPlatesPerSide(platesPerSide(25).plates)).toBe('');
  });
});
