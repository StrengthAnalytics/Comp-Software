import { describe, expect, it } from 'vitest';
import { entryUpdateSchema, lifterInputSchema, lifterSearchSchema } from '@/types/entry';

const UUID = '00000000-0000-0000-0000-000000000000';

describe('lifterInputSchema', () => {
  const base = {
    first_name: 'Dana',
    surname: 'Smith',
    gender: 'female',
    date_of_birth: '',
    ipf_member_id: '',
    club: '',
    country: '',
  };

  it('accepts a valid lifter and maps blank optional fields to null', () => {
    const result = lifterInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date_of_birth).toBeNull();
      expect(result.data.ipf_member_id).toBeNull();
      expect(result.data.club).toBeNull();
      expect(result.data.country).toBeNull();
    }
  });

  it('accepts a blank surname and stores it as an empty string', () => {
    const result = lifterInputSchema.safeParse({ ...base, surname: '  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.surname).toBe('');
    }
  });

  it('still rejects an empty first name', () => {
    expect(lifterInputSchema.safeParse({ ...base, first_name: '  ' }).success).toBe(false);
  });

  it('rejects an unknown gender', () => {
    expect(lifterInputSchema.safeParse({ ...base, gender: 'other' }).success).toBe(false);
  });
});

describe('lifterSearchSchema', () => {
  it('rejects an empty query', () => {
    expect(lifterSearchSchema.safeParse({ query: '   ' }).success).toBe(false);
  });

  it('accepts a surname fragment', () => {
    expect(lifterSearchSchema.safeParse({ query: 'smi' }).success).toBe(true);
  });
});

describe('entryUpdateSchema', () => {
  const base = {
    id: UUID,
    competitionId: UUID,
    weightClassId: null,
    divisionId: null,
    lotNumber: null,
    bodyweightKg: null,
    openerSquatKg: null,
    openerBenchKg: null,
    openerDeadliftKg: null,
    rackHeightSquat: '',
    rackHeightBench: '',
    status: 'registered',
  };

  it('accepts an entry with everything blank and maps blank rack heights to null', () => {
    const result = entryUpdateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rackHeightSquat).toBeNull();
      expect(result.data.rackHeightBench).toBeNull();
    }
  });

  it('rounds weights to one decimal place', () => {
    const result = entryUpdateSchema.safeParse({ ...base, bodyweightKg: 83.06 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bodyweightKg).toBe(83.1);
    }
  });

  it('rejects a non-positive opener', () => {
    expect(entryUpdateSchema.safeParse({ ...base, openerSquatKg: 0 }).success).toBe(false);
  });

  it('rejects a fractional lot number', () => {
    expect(entryUpdateSchema.safeParse({ ...base, lotNumber: 1.5 }).success).toBe(false);
  });

  it('accepts a positive integer lot number', () => {
    expect(entryUpdateSchema.safeParse({ ...base, lotNumber: 12 }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(entryUpdateSchema.safeParse({ ...base, status: 'napping' }).success).toBe(false);
  });

  it('rejects a non-uuid weight class', () => {
    expect(entryUpdateSchema.safeParse({ ...base, weightClassId: 'not-a-uuid' }).success).toBe(false);
  });
});
