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

export type AgeCategoryRecalcEntry = {
  id: string;
  dateOfBirth: string | null;
  divisionId: string | null;
};

export type AgeCategoryRecalcPlan = {
  // Entries whose division should change, paired with the division to set them to.
  updates: { entryId: string; divisionId: string }[];
  updated: number; // entries whose division changes
  unchanged: number; // already on their age-category division
  noDateOfBirth: number; // can't classify — left as-is
  noMatchingDivision: number; // computed category isn't a division in this comp — left as-is
};

// Works out which entries' divisions need changing to match their current age category, given the
// comp's start date and each entry's date of birth. Pure so the recalc action and its tests share one
// rule. An entry with no date of birth, or whose computed category has no matching division in the
// comp, is counted and left untouched (never cleared) rather than overwritten with a blank.
export function planAgeCategoryRecalc(
  competitionStartsOn: string | null,
  entries: readonly AgeCategoryRecalcEntry[],
  divisions: readonly { id: string; name: string }[],
): AgeCategoryRecalcPlan {
  const plan: AgeCategoryRecalcPlan = {
    updates: [],
    updated: 0,
    unchanged: 0,
    noDateOfBirth: 0,
    noMatchingDivision: 0,
  };

  for (const entry of entries) {
    const categoryName = resolveAgeCategory(competitionStartsOn, entry.dateOfBirth);
    if (categoryName === null) {
      plan.noDateOfBirth++;
      continue;
    }

    const division = matchDivisionByName(divisions, categoryName);
    if (!division) {
      plan.noMatchingDivision++;
      continue;
    }

    if (division.id === entry.divisionId) {
      plan.unchanged++;
      continue;
    }

    plan.updates.push({ entryId: entry.id, divisionId: division.id });
    plan.updated++;
  }

  return plan;
}
