import { describe, expect, it } from 'vitest';
import { compareFlightOrder, type FlightOrderFields } from '@/lib/flights/order';

function sorted(entries: FlightOrderFields[]): FlightOrderFields[] {
  return entries.toSorted(compareFlightOrder);
}

describe('compareFlightOrder', () => {
  it('orders by opener weight ascending', () => {
    const result = sorted([
      { openerKg: 120, lotNumber: 1 },
      { openerKg: 90, lotNumber: 2 },
      { openerKg: 100, lotNumber: 3 },
    ]);
    expect(result.map((entry) => entry.openerKg)).toEqual([90, 100, 120]);
  });

  it('breaks equal weights by lot number ascending', () => {
    const result = sorted([
      { openerKg: 100, lotNumber: 5 },
      { openerKg: 100, lotNumber: 2 },
      { openerKg: 100, lotNumber: 9 },
    ]);
    expect(result.map((entry) => entry.lotNumber)).toEqual([2, 5, 9]);
  });

  it('sorts missing openers last', () => {
    const result = sorted([
      { openerKg: null, lotNumber: 1 },
      { openerKg: 95, lotNumber: 2 },
    ]);
    expect(result.map((entry) => entry.openerKg)).toEqual([95, null]);
  });

  it('sorts a missing lot last among equal weights', () => {
    const result = sorted([
      { openerKg: 100, lotNumber: null },
      { openerKg: 100, lotNumber: 4 },
    ]);
    expect(result.map((entry) => entry.lotNumber)).toEqual([4, null]);
  });

  it('treats two fully-missing entries as equal', () => {
    expect(compareFlightOrder({ openerKg: null, lotNumber: null }, { openerKg: null, lotNumber: null })).toBe(0);
  });
});
