// Shared parsing for optional numeric form inputs. Blank (or whitespace-only) input and any
// non-numeric value map to null, so an empty box clears the field cleanly; the Zod schema at the
// boundary enforces range/integer rules. Used by the registration, weigh-in and run-screen forms.
export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

// Inverse of parseOptionalNumber for controlled inputs: null renders as an empty string.
export function numberToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

// Rounds to one decimal place — lift/attempt weights and openers are stored as numeric(5,1), in
// 0.5 kg increments — without the trailing float noise the raw arithmetic can leave (e.g. 0.1 + 0.2).
// The single rounding rule for those kg values: the registration/weigh-in/competition Zod transforms,
// the bulk-import parser, and the run screen's auto-progression all route through here.
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// Rounds to two decimal places — bodyweights and weight-class bounds are stored as numeric(5,2), the
// IPF weigh-in precision (0.01 kg), so a class boundary is unambiguous (83.00 kg is the -83 class,
// 83.01 kg is -93). Used by the bodyweight/weight-class Zod transforms and the bulk-import parser.
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
