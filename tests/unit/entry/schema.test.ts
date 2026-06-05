import { describe, expect, it } from 'vitest';
import { entryUpdateSchema, lifterInputSchema, lifterSearchSchema, rackSettingsSchema } from '@/types/entry';

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
    rackHeightSquat: null,
    squatRackSetting: null,
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
    status: 'registered',
  };

  it('accepts an entry with everything blank', () => {
    const result = entryUpdateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rackHeightSquat).toBeNull();
      expect(result.data.rackHeightBench).toBeNull();
      expect(result.data.squatRackSetting).toBeNull();
      expect(result.data.benchSpotting).toBeNull();
    }
  });

  it('accepts integer rack and bench heights with valid settings', () => {
    const result = entryUpdateSchema.safeParse({
      ...base,
      rackHeightSquat: 12,
      squatRackSetting: 'left_in',
      rackHeightBench: 4,
      benchSafetyHeight: 2,
      benchSpotting: 'hand_out',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a fractional rack height', () => {
    expect(entryUpdateSchema.safeParse({ ...base, rackHeightSquat: 12.5 }).success).toBe(false);
  });

  it('rejects a non-positive rack height', () => {
    expect(entryUpdateSchema.safeParse({ ...base, rackHeightBench: 0 }).success).toBe(false);
  });

  it('rejects an unknown squat rack setting', () => {
    expect(entryUpdateSchema.safeParse({ ...base, squatRackSetting: 'sideways' }).success).toBe(false);
  });

  it('rejects an unknown bench spotting choice', () => {
    expect(entryUpdateSchema.safeParse({ ...base, benchSpotting: 'liftoff' }).success).toBe(false);
  });

  it('rounds bodyweight to two decimal places (IPF weigh-in precision)', () => {
    const result = entryUpdateSchema.safeParse({ ...base, bodyweightKg: 83.066 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bodyweightKg).toBe(83.07);
    }
  });

  it('keeps openers at one decimal place', () => {
    const result = entryUpdateSchema.safeParse({ ...base, openerSquatKg: 83.06 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.openerSquatKg).toBe(83.1);
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

describe('rackSettingsSchema', () => {
  const squatBase = {
    entryId: UUID,
    competitionId: UUID,
    lift: 'squat',
    rackHeightSquat: null,
    squatRackSetting: null,
  };
  const benchBase = {
    entryId: UUID,
    competitionId: UUID,
    lift: 'bench',
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
  };

  it('accepts a squat rack edit with a height and setting', () => {
    const result = rackSettingsSchema.safeParse({ ...squatBase, rackHeightSquat: 12, squatRackSetting: 'left_in' });
    expect(result.success).toBe(true);
  });

  it('accepts a bench rack edit with heights and spotting', () => {
    const result = rackSettingsSchema.safeParse({
      ...benchBase,
      rackHeightBench: 4,
      benchSafetyHeight: 2,
      benchSpotting: 'hand_out',
    });
    expect(result.success).toBe(true);
  });

  it('accepts nulls to clear a lift’s rack settings', () => {
    expect(rackSettingsSchema.safeParse(squatBase).success).toBe(true);
    expect(rackSettingsSchema.safeParse(benchBase).success).toBe(true);
  });

  it('rejects a fractional rack height', () => {
    expect(rackSettingsSchema.safeParse({ ...squatBase, rackHeightSquat: 12.5 }).success).toBe(false);
  });

  it('rejects a non-positive rack height', () => {
    expect(rackSettingsSchema.safeParse({ ...benchBase, rackHeightBench: 0 }).success).toBe(false);
  });

  it('rejects an unknown squat rack setting', () => {
    expect(rackSettingsSchema.safeParse({ ...squatBase, squatRackSetting: 'sideways' }).success).toBe(false);
  });

  it('rejects an unknown bench spotting choice', () => {
    expect(rackSettingsSchema.safeParse({ ...benchBase, benchSpotting: 'liftoff' }).success).toBe(false);
  });

  it('rejects an unknown lift', () => {
    expect(rackSettingsSchema.safeParse({ entryId: UUID, competitionId: UUID, lift: 'deadlift' }).success).toBe(false);
  });

  it('rejects a squat-shaped payload sent under the bench lift', () => {
    // Discriminated on lift: a bench edit must carry the bench fields, so a squat-shaped payload
    // relabelled as bench is missing them and is rejected.
    const result = rackSettingsSchema.safeParse({ ...squatBase, lift: 'bench' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid entry id', () => {
    expect(rackSettingsSchema.safeParse({ ...squatBase, entryId: 'not-a-uuid' }).success).toBe(false);
  });
});
