// Within a flight, lifters are ordered by declared weight ascending, then by lot number ascending
// at equal weights (CLAUDE.md). At setup time the opener of the meet's first contested lift stands
// in for the declared weight, giving a preview of the round-one running order. Missing values sort
// last so lifters without an opener or lot don't lead the order.

export type FlightOrderFields = {
  openerKg: number | null;
  lotNumber: number | null;
};

function nullsLast(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

// Ordered comparison rather than subtraction: two missing values both map to Infinity, and
// Infinity - Infinity is NaN, which would corrupt the sort.
function compareValues(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function compareFlightOrder(a: FlightOrderFields, b: FlightOrderFields): number {
  const byWeight = compareValues(nullsLast(a.openerKg), nullsLast(b.openerKg));
  if (byWeight !== 0) {
    return byWeight;
  }
  return compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber));
}
