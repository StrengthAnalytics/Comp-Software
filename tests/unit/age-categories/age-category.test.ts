import { describe, expect, it } from 'vitest';
import {
  ipfAgeCategory,
  isoYear,
  matchAgeCategoryByName,
  planAgeCategoryRecalc,
  resolveAgeCategory,
} from '@/lib/age-categories/age-category';

describe('ipfAgeCategory', () => {
  const COMP_YEAR = 2026;

  // Each case is [birthYear, expected name]; the age is COMP_YEAR − birthYear.
  const cases: ReadonlyArray<readonly [number, string]> = [
    [2026, 'U16'], // age 0
    [2011, 'U16'], // age 15 — top of U16
    [2010, 'U18'], // age 16 — bottom of U18
    [2008, 'U18'], // age 18 — top of U18
    [2007, 'U23'], // age 19 — bottom of U23
    [2003, 'U23'], // age 23 — top of U23
    [2002, 'Open'], // age 24 — bottom of Open
    [1987, 'Open'], // age 39 — top of Open
    [1986, 'M1'], // age 40 — bottom of M1
    [1977, 'M1'], // age 49 — top of M1
    [1976, 'M2'], // age 50
    [1967, 'M2'], // age 59
    [1966, 'M3'], // age 60
    [1957, 'M3'], // age 69
    [1956, 'M4'], // age 70
    [1947, 'M4'], // age 79
    [1946, 'M5'], // age 80
    [1937, 'M5'], // age 89
    [1936, 'M6'], // age 90 — bottom of the open-ended masters band
    [1916, 'M6'], // age 110
  ];

  for (const [birthYear, expected] of cases) {
    it(`maps a lifter born ${birthYear} (age ${COMP_YEAR - birthYear}) to ${expected}`, () => {
      expect(ipfAgeCategory(COMP_YEAR, birthYear)).toBe(expected);
    });
  }

  it('returns null for a nonsensical future birth year (birth year after the comp year)', () => {
    expect(ipfAgeCategory(2026, 2030)).toBeNull();
  });
});

describe('isoYear', () => {
  it('reads the year from a valid ISO date', () => {
    expect(isoYear('1995-04-02')).toBe(1995);
  });

  it('returns null for missing or malformed dates', () => {
    expect(isoYear(null)).toBeNull();
    expect(isoYear('')).toBeNull();
    expect(isoYear('02/04/1995')).toBeNull();
    expect(isoYear('1995-4-2')).toBeNull();
  });
});

describe('resolveAgeCategory', () => {
  it('resolves the category from the comp start year and the birth year', () => {
    expect(resolveAgeCategory('2026-03-14', '1986-12-31')).toBe('M1');
    expect(resolveAgeCategory('2026-03-14', '2003-01-01')).toBe('U23');
  });

  it('uses the start date year for a meet spanning a year boundary', () => {
    expect(resolveAgeCategory('2026-12-31', '1986-01-01')).toBe('M1');
  });

  it('returns null when the competition has no date', () => {
    expect(resolveAgeCategory(null, '1986-12-31')).toBeNull();
  });

  it('returns null when the lifter has no date of birth', () => {
    expect(resolveAgeCategory('2026-03-14', null)).toBeNull();
  });

  it('returns null for a date of birth after the competition (a typo), not the youngest band', () => {
    expect(resolveAgeCategory('2026-03-14', '2030-01-01')).toBeNull();
  });
});

describe('matchAgeCategoryByName', () => {
  const ageCategories = [
    { id: 'a', name: 'Open' },
    { id: 'b', name: 'M1' },
    { id: 'c', name: ' U23 ' },
  ];

  it('matches an age category by name, case- and whitespace-insensitively', () => {
    expect(matchAgeCategoryByName(ageCategories, 'open')?.id).toBe('a');
    expect(matchAgeCategoryByName(ageCategories, 'U23')?.id).toBe('c');
  });

  it('returns null when no age category matches or the category is null', () => {
    expect(matchAgeCategoryByName(ageCategories, 'M6')).toBeNull();
    expect(matchAgeCategoryByName(ageCategories, null)).toBeNull();
  });
});

describe('planAgeCategoryRecalc', () => {
  const ageCategories = [
    { id: 'open', name: 'Open' },
    { id: 'm1', name: 'M1' },
    { id: 'u23', name: 'U23' },
  ];
  const startsOn = '2026-03-14';

  it('queues an update when an entry is on the wrong age category', () => {
    // Born 1986 → age 40 in 2026 → M1, currently on Open.
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1986-05-01', ageCategoryId: 'open' }],
      ageCategories,
    );
    expect(plan.updates).toEqual([{ entryId: 'e1', ageCategoryId: 'm1' }]);
    expect(plan).toMatchObject({ updated: 1, unchanged: 0, noDateOfBirth: 0, noMatchingAgeCategory: 0 });
  });

  it('leaves an entry already on its age category unchanged', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1986-05-01', ageCategoryId: 'm1' }],
      ageCategories,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ updated: 0, unchanged: 1 });
  });

  it('counts an entry with no date of birth and leaves it untouched', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: null, ageCategoryId: 'open' }],
      ageCategories,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ noDateOfBirth: 1, updated: 0, unchanged: 0 });
  });

  it('counts an entry whose category has no matching age category and leaves it untouched', () => {
    // Born 1956 → age 70 → M4, which this comp does not have.
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1956-05-01', ageCategoryId: 'open' }],
      ageCategories,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ noMatchingAgeCategory: 1, updated: 0 });
  });

  it('assigns a previously blank age category', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '2005-05-01', ageCategoryId: null }],
      ageCategories,
    );
    expect(plan.updates).toEqual([{ entryId: 'e1', ageCategoryId: 'u23' }]);
    expect(plan.updated).toBe(1);
  });

  it('tallies a mixed roster', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [
        { id: 'a', dateOfBirth: '1986-05-01', ageCategoryId: 'open' }, // → M1 (update)
        { id: 'b', dateOfBirth: '2002-05-01', ageCategoryId: 'open' }, // age 24 → Open (unchanged)
        { id: 'c', dateOfBirth: null, ageCategoryId: 'open' }, // no DOB
        { id: 'd', dateOfBirth: '1956-05-01', ageCategoryId: null }, // → M4, absent (no age category)
      ],
      ageCategories,
    );
    expect(plan).toMatchObject({ updated: 1, unchanged: 1, noDateOfBirth: 1, noMatchingAgeCategory: 1 });
    expect(plan.updates).toEqual([{ entryId: 'a', ageCategoryId: 'm1' }]);
  });
});
