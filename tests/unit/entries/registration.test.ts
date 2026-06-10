import { describe, expect, it } from 'vitest';
import { deriveAgeCategoryId, matchWeightClassByName } from '@/lib/entries/registration';

const ageCategories = [
  { id: 'cat-open', name: 'Open' },
  { id: 'cat-m1', name: 'M1' },
];

describe('deriveAgeCategoryId', () => {
  it('derives the band from the comp and birth years and matches it to a row', () => {
    expect(deriveAgeCategoryId(ageCategories, '2026-07-11', '1990-03-02')).toBe('cat-open');
    expect(deriveAgeCategoryId(ageCategories, '2026-07-11', '1980-03-02')).toBe('cat-m1');
  });

  it('returns null when a date is missing or malformed', () => {
    expect(deriveAgeCategoryId(ageCategories, null, '1990-03-02')).toBeNull();
    expect(deriveAgeCategoryId(ageCategories, '2026-07-11', null)).toBeNull();
    expect(deriveAgeCategoryId(ageCategories, '2026-07-11', 'not-a-date')).toBeNull();
  });

  it('returns null when the comp has no row for the computed band', () => {
    // 2026 − 2012 = 14 → U16, which this comp does not have.
    expect(deriveAgeCategoryId(ageCategories, '2026-07-11', '2012-03-02')).toBeNull();
  });
});

const weightClasses = [
  { id: 'wc-m83', name: '-83 kg', gender: 'male' },
  { id: 'wc-f63', name: '-63 kg', gender: 'female' },
];

describe('matchWeightClassByName', () => {
  it('matches by name for the lifter’s sex, case- and whitespace-insensitively', () => {
    const match = matchWeightClassByName(weightClasses, '  -83 KG ', 'male');
    expect(match).toEqual({ status: 'matched', weightClass: weightClasses[0] });
  });

  it('distinguishes a wrong-sex class from an unknown one', () => {
    expect(matchWeightClassByName(weightClasses, '-63 kg', 'male')).toEqual({ status: 'wrong_gender' });
    expect(matchWeightClassByName(weightClasses, '-999 kg', 'male')).toEqual({ status: 'not_found' });
  });

  it('prefers the row for the lifter’s own sex when both sexes share a class name', () => {
    const shared = [
      { id: 'wc-m', name: '-72 kg', gender: 'male' },
      { id: 'wc-f', name: '-72 kg', gender: 'female' },
    ];
    expect(matchWeightClassByName(shared, '-72 kg', 'female')).toEqual({
      status: 'matched',
      weightClass: shared[1],
    });
  });
});
