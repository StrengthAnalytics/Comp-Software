import { describe, expect, it } from 'vitest';
import {
  competitionInputSchema,
  divisionInputSchema,
  slugify,
  weightClassInputSchema,
} from '@/types/competition';

const UUID = '00000000-0000-0000-0000-000000000000';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Spring Open 2026')).toBe('spring-open-2026');
  });

  it('strips diacritics and punctuation', () => {
    expect(slugify('  Héllo Wörld!! ')).toBe('hello-world');
  });

  it('collapses and trims hyphens', () => {
    expect(slugify('---a--b--')).toBe('a-b');
  });
});

describe('competitionInputSchema', () => {
  const base = {
    name: 'Spring Open',
    slug: 'spring-open',
    kit_type: 'classic',
    event_type: 'full_power',
    status: 'draft',
    starts_on: '',
    ends_on: '',
  };

  it('accepts a valid competition and maps empty dates to null', () => {
    const result = competitionInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.starts_on).toBeNull();
      expect(result.data.ends_on).toBeNull();
    }
  });

  it('rejects a slug with invalid characters', () => {
    const result = competitionInputSchema.safeParse({ ...base, slug: 'Spring Open' });
    expect(result.success).toBe(false);
  });

  it('rejects an end date before the start date', () => {
    const result = competitionInputSchema.safeParse({
      ...base,
      starts_on: '2026-06-02',
      ends_on: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid date range', () => {
    const result = competitionInputSchema.safeParse({
      ...base,
      starts_on: '2026-06-01',
      ends_on: '2026-06-02',
    });
    expect(result.success).toBe(true);
  });

  it('defaults is_team_competition to false', () => {
    const result = competitionInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_team_competition).toBe(false);
    }
  });

  it('allows a team competition for full power', () => {
    expect(competitionInputSchema.safeParse({ ...base, is_team_competition: true }).success).toBe(true);
  });

  it('rejects a team competition that is not full power', () => {
    const result = competitionInputSchema.safeParse({
      ...base,
      event_type: 'bench_only',
      is_team_competition: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('divisionInputSchema', () => {
  it('defaults sort order to 0', () => {
    const result = divisionInputSchema.safeParse({ competitionId: UUID, name: 'Open' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('rejects an empty name', () => {
    const result = divisionInputSchema.safeParse({ competitionId: UUID, name: '  ' });
    expect(result.success).toBe(false);
  });
});

describe('weightClassInputSchema', () => {
  const base = {
    competitionId: UUID,
    name: '-83 kg',
    gender: 'male',
    lowerKg: 74,
    upperKg: 83,
    sortOrder: 0,
  };

  it('accepts a bounded class', () => {
    expect(weightClassInputSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an unlimited (null upper) class', () => {
    expect(weightClassInputSchema.safeParse({ ...base, name: '120 kg+', upperKg: null }).success).toBe(
      true,
    );
  });

  it('rejects an upper bound below the lower bound', () => {
    expect(weightClassInputSchema.safeParse({ ...base, upperKg: 70 }).success).toBe(false);
  });

  it('rounds bounds to two decimal places (so a lower bound can sit 0.01 above the class below)', () => {
    const result = weightClassInputSchema.safeParse({ ...base, upperKg: 83.066 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.upperKg).toBe(83.07);
    }
  });
});
