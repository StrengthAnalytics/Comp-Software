import { describe, expect, it } from 'vitest';
import {
  ipfAgeCategory,
  isoYear,
  matchDivisionByName,
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
