// Shared sort helpers for running-order comparators (flights, weigh-in, live running order).

// Missing values sort last, so an entry without a weight, lot or sort order never leads the order.
export function nullsLast(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

// Ordered comparison rather than subtraction: two missing values both map to Infinity, and
// Infinity - Infinity is NaN, which would corrupt the sort.
export function compareValues(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
