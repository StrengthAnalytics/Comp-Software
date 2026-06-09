import { describe, expect, it } from 'vitest';
import { cellTint, liftHasRack, rackText } from '@/lib/scorekeeper/board-format';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';

function makeEntry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: 'e1',
    lifterName: 'Smith, Jo',
    sex: 'male',
    flightId: 'f1',
    lotNumber: 1,
    teamLift: null,
    teamId: null,
    teamName: null,
    bodyweightKg: 80,
    weightClassId: null,
    weightClassName: '83',
    ageCategoryId: null,
    ageCategoryName: 'Open',
    rackHeightSquat: null,
    squatRackSetting: null,
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<BoardAttempt> = {}): BoardAttempt {
  return {
    id: 'a1',
    entryId: 'e1',
    lift: 'squat',
    attemptNumber: 1,
    weightKg: 100,
    result: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

describe('liftHasRack', () => {
  it('is true for squat and bench, false for deadlift', () => {
    expect(liftHasRack('squat')).toBe(true);
    expect(liftHasRack('bench')).toBe(true);
    expect(liftHasRack('deadlift')).toBe(false);
  });
});

describe('rackText', () => {
  it('joins squat rack height and setting', () => {
    expect(rackText(makeEntry({ rackHeightSquat: 14, squatRackSetting: 'in' }), 'squat')).toBe('14 IN');
  });

  it('shows only the present squat fields', () => {
    expect(rackText(makeEntry({ rackHeightSquat: 14, squatRackSetting: null }), 'squat')).toBe('14');
    expect(rackText(makeEntry({ rackHeightSquat: null, squatRackSetting: null }), 'squat')).toBe('—');
  });

  it('prefixes bench rack and safety heights and appends spotting', () => {
    expect(
      rackText(makeEntry({ rackHeightBench: 8, benchSafetyHeight: 4, benchSpotting: 'self' }), 'bench'),
    ).toBe('R8 S4 SELF');
  });

  it('has no rack text for deadlift', () => {
    expect(rackText(makeEntry(), 'deadlift')).toBe('—');
  });
});

describe('cellTint', () => {
  it('tints a good lift green and a no lift red', () => {
    expect(cellTint(makeAttempt({ result: 'good_lift' }), false)).toBe('bg-green-200');
    expect(cellTint(makeAttempt({ result: 'no_lift' }), false)).toBe('bg-red-200');
  });

  it('tints another terminal result neutral', () => {
    expect(cellTint(makeAttempt({ result: 'not_taken' }), false)).toBe('bg-neutral-200');
    expect(cellTint(makeAttempt({ result: 'withdrawn' }), false)).toBe('bg-neutral-200');
  });

  it('tints the on-platform pending attempt amber, otherwise untinted', () => {
    expect(cellTint(makeAttempt({ result: 'pending' }), true)).toBe('bg-amber-100');
    expect(cellTint(makeAttempt({ result: 'pending' }), false)).toBe('');
  });

  it('falls back to the current highlight when there is no declared attempt', () => {
    expect(cellTint(undefined, true)).toBe('bg-amber-100');
    expect(cellTint(undefined, false)).toBe('');
    // A row with no weight is not yet a real attempt, so it tints only as the current cell.
    expect(cellTint(makeAttempt({ weightKg: null, result: 'pending' }), true)).toBe('bg-amber-100');
  });
});
