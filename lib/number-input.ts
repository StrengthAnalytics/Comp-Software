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
