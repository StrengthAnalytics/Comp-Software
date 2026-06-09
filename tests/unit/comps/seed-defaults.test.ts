import { describe, expect, it } from 'vitest';
import { defaultAgeCategoryRows, defaultWeightClassRows } from '@/lib/comps/seed-defaults';
import { DEFAULT_AGE_CATEGORIES, DEFAULT_WEIGHT_CLASSES } from '@/lib/constants';

const COMP_ID = '00000000-0000-0000-0000-000000000000';

describe('defaultAgeCategoryRows', () => {
  it('builds one row per default age category, in order, tagged to the comp', () => {
    const rows = defaultAgeCategoryRows(COMP_ID);
    expect(rows).toHaveLength(DEFAULT_AGE_CATEGORIES.length);
    expect(rows.map((row) => row.name)).toEqual([...DEFAULT_AGE_CATEGORIES]);
    for (const [index, row] of rows.entries()) {
      expect(row.competition_id).toBe(COMP_ID);
      expect(row.sort_order).toBe(index);
    }
  });
});

describe('defaultWeightClassRows', () => {
  it('builds one row per default weight class, preserving bounds and gender, in order', () => {
    const rows = defaultWeightClassRows(COMP_ID);
    expect(rows).toHaveLength(DEFAULT_WEIGHT_CLASSES.length);
    for (const [index, row] of rows.entries()) {
      const source = DEFAULT_WEIGHT_CLASSES[index];
      expect(row).toMatchObject({
        competition_id: COMP_ID,
        name: source.name,
        gender: source.gender,
        lower_kg: source.lower_kg,
        upper_kg: source.upper_kg,
        sort_order: index,
      });
    }
  });
});
