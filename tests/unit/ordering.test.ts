import { describe, expect, it } from 'vitest';
import { compareValues, nullsLast } from '@/lib/ordering';

describe('nullsLast', () => {
  it('passes numbers through and maps null to +Infinity', () => {
    expect(nullsLast(5)).toBe(5);
    expect(nullsLast(0)).toBe(0);
    expect(nullsLast(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('compareValues', () => {
  it('orders ascending', () => {
    expect(compareValues(1, 2)).toBe(-1);
    expect(compareValues(2, 1)).toBe(1);
    expect(compareValues(1, 1)).toBe(0);
  });

  it('treats two Infinities (two nulls via nullsLast) as equal, not NaN', () => {
    expect(compareValues(nullsLast(null), nullsLast(null))).toBe(0);
  });

  it('sorts a missing value last when used with nullsLast', () => {
    const sorted = [null, 3, 1].toSorted((a, b) => compareValues(nullsLast(a), nullsLast(b)));
    expect(sorted).toEqual([1, 3, null]);
  });
});
