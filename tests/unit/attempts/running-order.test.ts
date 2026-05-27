import { describe, expect, it } from 'vitest';
import {
  compareRunningOrder,
  selectPlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';

const base: RunningOrderFields = {
  lift: 'squat',
  flightSortOrder: 0,
  attemptNumber: 1,
  weightKg: 100,
  lotNumber: 1,
};

function sorted(rows: RunningOrderFields[]): RunningOrderFields[] {
  return rows.toSorted(compareRunningOrder);
}

describe('compareRunningOrder', () => {
  it('orders by lift: squat, then bench, then deadlift', () => {
    const result = sorted([
      { ...base, lift: 'deadlift' },
      { ...base, lift: 'squat' },
      { ...base, lift: 'bench' },
    ]);
    expect(result.map((row) => row.lift)).toEqual(['squat', 'bench', 'deadlift']);
  });

  it('orders by flight before round (flight A fully precedes flight B)', () => {
    // Flight A round 3 must come before flight B round 1.
    const result = sorted([
      { ...base, flightSortOrder: 1, attemptNumber: 1, weightKg: 50 },
      { ...base, flightSortOrder: 0, attemptNumber: 3, weightKg: 300 },
    ]);
    expect(result.map((row) => row.flightSortOrder)).toEqual([0, 1]);
  });

  it('orders by round before weight within a flight', () => {
    const result = sorted([
      { ...base, attemptNumber: 2, weightKg: 80 },
      { ...base, attemptNumber: 1, weightKg: 200 },
    ]);
    expect(result.map((row) => row.attemptNumber)).toEqual([1, 2]);
  });

  it('orders by rising bar (weight ascending) within a round', () => {
    const result = sorted([
      { ...base, weightKg: 120 },
      { ...base, weightKg: 90 },
      { ...base, weightKg: 105 },
    ]);
    expect(result.map((row) => row.weightKg)).toEqual([90, 105, 120]);
  });

  it('breaks equal weights by lot number ascending', () => {
    const result = sorted([
      { ...base, weightKg: 100, lotNumber: 5 },
      { ...base, weightKg: 100, lotNumber: 2 },
    ]);
    expect(result.map((row) => row.lotNumber)).toEqual([2, 5]);
  });

  it('sorts an undeclared weight last within a round', () => {
    const result = sorted([
      { ...base, weightKg: null },
      { ...base, weightKg: 95 },
    ]);
    expect(result.map((row) => row.weightKg)).toEqual([95, null]);
  });
});

describe('selectPlatformPositions', () => {
  const rows = [
    { ...base, id: 'a', weightKg: 100, result: 'pending' as const },
    { ...base, id: 'b', weightKg: 110, result: 'pending' as const },
    { ...base, id: 'c', weightKg: 120, result: 'pending' as const },
    { ...base, id: 'd', weightKg: 130, result: 'pending' as const },
  ];

  it('returns the first three pending attempts in order', () => {
    const { onPlatform, onDeck, inTheHole } = selectPlatformPositions(rows);
    expect([onPlatform?.id, onDeck?.id, inTheHole?.id]).toEqual(['a', 'b', 'c']);
  });

  it('skips attempts that are not pending', () => {
    const { onPlatform } = selectPlatformPositions([
      { ...base, id: 'done', weightKg: 90, result: 'good_lift' as const },
      { ...base, id: 'next', weightKg: 100, result: 'pending' as const },
    ]);
    expect(onPlatform?.id).toBe('next');
  });

  it('skips pending attempts without a declared weight', () => {
    const { onPlatform } = selectPlatformPositions([
      { ...base, id: 'undeclared', weightKg: null, result: 'pending' as const },
      { ...base, id: 'declared', weightKg: 100, result: 'pending' as const },
    ]);
    expect(onPlatform?.id).toBe('declared');
  });

  it('returns nulls when the queue is empty', () => {
    expect(selectPlatformPositions([])).toEqual({ onPlatform: null, onDeck: null, inTheHole: null });
  });
});
