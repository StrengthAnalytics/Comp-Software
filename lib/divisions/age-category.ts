// IPF age category from the competition year and the lifter's birth year.
//
// The IPF assigns the age category on (competition year − birth year) — a pure birth-year
// comparison, not the exact age on meet day — so the only inputs that matter are the two years.
// The returned name matches the seeded DEFAULT_DIVISIONS so the entries flow can resolve it to one
// of a comp's division rows by name; a comp that doesn't have that division simply leaves the
// category unselected for the operator to fill in by hand.
//
// Bands (competition year − birth year), each an inclusive upper bound:
//   ≤15 U16 · 16–18 U18 · 19–23 U23 · 24–39 Open · 40–49 M1 · 50–59 M2 · 60–69 M3 · 70–79 M4
//   · 80–89 M5 · ≥90 M6
//
// U16/U18 split the IPF sub-junior band by the British Powerlifting youth classes the app seeds;
// U23 is the junior band, Open the senior band, and M1–M6 the masters bands (M5/M6 extend the
// official IPF set, which stops at M4, as a house rule mirrored by the seed and records vocabulary).

const AGE_CATEGORY_BANDS: readonly { readonly maxAge: number; readonly name: string }[] = [
  { maxAge: 15, name: 'U16' },
  { maxAge: 18, name: 'U18' },
  { maxAge: 23, name: 'U23' },
  { maxAge: 39, name: 'Open' },
  { maxAge: 49, name: 'M1' },
  { maxAge: 59, name: 'M2' },
  { maxAge: 69, name: 'M3' },
  { maxAge: 79, name: 'M4' },
  { maxAge: 89, name: 'M5' },
];

// The oldest band is open-ended (90 and over).
const OLDEST_CATEGORY = 'M6';

// The age-category name for a lifter at a meet. Takes the difference of the two years (so a lifter
// turning 40 anywhere in the competition year is M1 for the whole year, per IPF). A nonsensical
// difference below the youngest band's bound falls through to the youngest category.
export function ipfAgeCategory(competitionYear: number, birthYear: number): string {
  const age = competitionYear - birthYear;
  const band = AGE_CATEGORY_BANDS.find((entry) => age <= entry.maxAge);
  return band ? band.name : OLDEST_CATEGORY;
}

// The four-digit year from an ISO `YYYY-MM-DD` date, or null when the string is missing or malformed.
export function isoYear(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso);
  return match ? Number(match[1]) : null;
}

// Resolves the IPF age-category name for a lifter from the competition start date and the lifter's
// date of birth (both ISO `YYYY-MM-DD`). Returns null when either date is missing or malformed —
// the caller then leaves the division unset. A meet that spans a year boundary uses the start year.
export function resolveAgeCategory(
  competitionStartsOn: string | null,
  dateOfBirth: string | null,
): string | null {
  const competitionYear = isoYear(competitionStartsOn);
  const birthYear = isoYear(dateOfBirth);
  if (competitionYear === null || birthYear === null) {
    return null;
  }
  return ipfAgeCategory(competitionYear, birthYear);
}

// Finds the division whose name matches the given category, case- and whitespace-insensitively, or
// null. Mirrors the name resolution the bulk importer uses, so a comp keeps one rule for turning a
// category name into one of its division rows.
export function matchDivisionByName<T extends { name: string }>(
  divisions: readonly T[],
  categoryName: string | null,
): T | null {
  if (!categoryName) {
    return null;
  }
  const target = categoryName.trim().toLowerCase();
  return divisions.find((division) => division.name.trim().toLowerCase() === target) ?? null;
}
