import { describe, expect, it } from 'vitest';
import {
  ipfAgeCategory,
  isoYear,
  matchDivisionByName,
  planAgeCategoryRecalc,
  resolveAgeCategory,
} from '@/lib/divisions/age-category';

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

  it('falls through to the youngest category for a nonsensical future birth year', () => {
    expect(ipfAgeCategory(2026, 2030)).toBe('U16');
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
});

describe('matchDivisionByName', () => {
  const divisions = [
    { id: 'a', name: 'Open' },
    { id: 'b', name: 'M1' },
    { id: 'c', name: ' U23 ' },
  ];

  it('matches a division by name, case- and whitespace-insensitively', () => {
    expect(matchDivisionByName(divisions, 'open')?.id).toBe('a');
    expect(matchDivisionByName(divisions, 'U23')?.id).toBe('c');
  });

  it('returns null when no division matches or the category is null', () => {
    expect(matchDivisionByName(divisions, 'M6')).toBeNull();
    expect(matchDivisionByName(divisions, null)).toBeNull();
  });
});

describe('planAgeCategoryRecalc', () => {
  const divisions = [
    { id: 'open', name: 'Open' },
    { id: 'm1', name: 'M1' },
    { id: 'u23', name: 'U23' },
  ];
  const startsOn = '2026-03-14';

  it('queues an update when an entry is on the wrong age division', () => {
    // Born 1986 → age 40 in 2026 → M1, currently on Open.
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1986-05-01', divisionId: 'open' }],
      divisions,
    );
    expect(plan.updates).toEqual([{ entryId: 'e1', divisionId: 'm1' }]);
    expect(plan).toMatchObject({ updated: 1, unchanged: 0, noDateOfBirth: 0, noMatchingDivision: 0 });
  });

  it('leaves an entry already on its age division unchanged', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1986-05-01', divisionId: 'm1' }],
      divisions,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ updated: 0, unchanged: 1 });
  });

  it('counts an entry with no date of birth and leaves it untouched', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: null, divisionId: 'open' }],
      divisions,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ noDateOfBirth: 1, updated: 0, unchanged: 0 });
  });

  it('counts an entry whose category has no matching division and leaves it untouched', () => {
    // Born 1956 → age 70 → M4, which this comp does not have.
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '1956-05-01', divisionId: 'open' }],
      divisions,
    );
    expect(plan.updates).toEqual([]);
    expect(plan).toMatchObject({ noMatchingDivision: 1, updated: 0 });
  });

  it('assigns a previously blank division', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [{ id: 'e1', dateOfBirth: '2005-05-01', divisionId: null }],
      divisions,
    );
    expect(plan.updates).toEqual([{ entryId: 'e1', divisionId: 'u23' }]);
    expect(plan.updated).toBe(1);
  });

  it('tallies a mixed roster', () => {
    const plan = planAgeCategoryRecalc(
      startsOn,
      [
        { id: 'a', dateOfBirth: '1986-05-01', divisionId: 'open' }, // → M1 (update)
        { id: 'b', dateOfBirth: '2002-05-01', divisionId: 'open' }, // age 24 → Open (unchanged)
        { id: 'c', dateOfBirth: null, divisionId: 'open' }, // no DOB
        { id: 'd', dateOfBirth: '1956-05-01', divisionId: null }, // → M4, absent (no division)
      ],
      divisions,
    );
    expect(plan).toMatchObject({ updated: 1, unchanged: 1, noDateOfBirth: 1, noMatchingDivision: 1 });
    expect(plan.updates).toEqual([{ entryId: 'a', divisionId: 'm1' }]);
  });
});
