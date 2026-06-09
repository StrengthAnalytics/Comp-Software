// Whole days from `fromIso` to `toIso` (both strict ISO `YYYY-MM-DD`): positive when `toIso` is
// later, 0 for the same day, negative when it has passed. Null when either date is not real, so a
// caller renders nothing rather than NaN. Calendar-day arithmetic in UTC — no time-of-day or
// timezone component — which is all the Overview page's "days to go" figure needs.
export function daysBetweenIsoDates(fromIso: string, toIso: string): number | null {
  if (!isRealIsoDate(fromIso) || !isRealIsoDate(toIso)) {
    return null;
  }
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / MS_PER_DAY);
}

// True when `value` is a real calendar date in strict ISO `YYYY-MM-DD` form — i.e. the month is
// 1-12 and the day exists in that month (Feb 29 only in a leap year). The plain regex used at the
// validation boundary accepts impossible dates like 2020-02-31; this rejects them before they reach
// a Postgres `date` column (which would otherwise throw and abort a whole bulk import).
export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // Round-trip through a UTC date: an out-of-range day rolls over to the next month, so the parts
  // won't match if the date wasn't real.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
