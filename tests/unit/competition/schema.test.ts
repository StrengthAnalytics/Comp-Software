import { describe, expect, it } from 'vitest';
import {
  ageCategoryInputSchema,
  competitionCreateSchema,
  competitionInputSchema,
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

  it.each(['comps', 'records', 'account', 'auth', 'api'])(
    'rejects the reserved route segment %s as a slug',
    (slug) => {
      expect(competitionInputSchema.safeParse({ ...base, slug }).success).toBe(false);
    },
  );

  it('accepts a slug that merely contains a reserved word', () => {
    expect(competitionInputSchema.safeParse({ ...base, slug: 'club-records-2026' }).success).toBe(true);
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

  it('ignores a federation key on update (federation is fixed at creation)', () => {
    const result = competitionInputSchema.safeParse({ ...base, federation: 'ipf' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('federation' in result.data).toBe(false);
    }
  });
});

describe('competitionCreateSchema', () => {
  const base = {
    name: 'Spring Open',
    slug: 'spring-open',
    kit_type: 'classic',
    event_type: 'full_power',
    status: 'draft',
    starts_on: '',
    ends_on: '',
  };

  it.each(['ipf', 'custom'])('accepts federation %s', (federation) => {
    expect(competitionCreateSchema.safeParse({ ...base, federation }).success).toBe(true);
  });

  it('rejects a missing federation', () => {
    expect(competitionCreateSchema.safeParse(base).success).toBe(false);
  });

  it('rejects a federation outside the two codes', () => {
    expect(competitionCreateSchema.safeParse({ ...base, federation: 'IPF' }).success).toBe(false);
    expect(competitionCreateSchema.safeParse({ ...base, federation: 'wrpf' }).success).toBe(false);
  });

  it('keeps the shared rules (team comps must be full power)', () => {
    const result = competitionCreateSchema.safeParse({
      ...base,
      federation: 'ipf',
      event_type: 'bench_only',
      is_team_competition: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('ageCategoryInputSchema', () => {
  it('defaults sort order to 0', () => {
    const result = ageCategoryInputSchema.safeParse({ competitionId: UUID, name: 'Open' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('rejects an empty name', () => {
    const result = ageCategoryInputSchema.safeParse({ competitionId: UUID, name: '  ' });
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
