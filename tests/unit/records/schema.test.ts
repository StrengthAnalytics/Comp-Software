import { describe, expect, it } from 'vitest';
import { recordDeleteSchema, recordInputSchema, recordUpdateSchema } from '@/types/record';

const UUID = '00000000-0000-0000-0000-000000000000';

const base = {
  region: 'England',
  name: 'John Smith',
  gender: 'M',
  weightClass: '83kg',
  ageCategory: 'Open',
  lift: 'squat',
  equipment: 'unequipped',
  weightKg: 280.5,
  dateSet: '2024-01-15',
  notes: '',
};

describe('recordInputSchema', () => {
  it('accepts a valid record and maps blank date/notes to null', () => {
    const result = recordInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateSet).toBe('2024-01-15');
      expect(result.data.notes).toBeNull();
    }
  });

  it('maps a blank date to null', () => {
    const result = recordInputSchema.safeParse({ ...base, dateSet: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateSet).toBeNull();
    }
  });

  it('rounds the weight to one decimal place', () => {
    const result = recordInputSchema.safeParse({ ...base, weightKg: 280.44 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightKg).toBe(280.4);
    }
  });

  it.each([0, -5])('rejects a non-positive weight (%s)', (weightKg) => {
    expect(recordInputSchema.safeParse({ ...base, weightKg }).success).toBe(false);
  });

  it('requires a region, name, weight class and age category', () => {
    for (const field of ['region', 'name', 'weightClass', 'ageCategory'] as const) {
      expect(recordInputSchema.safeParse({ ...base, [field]: '  ' }).success).toBe(false);
    }
  });

  it('rejects an unknown gender, lift or equipment', () => {
    expect(recordInputSchema.safeParse({ ...base, gender: 'X' }).success).toBe(false);
    expect(recordInputSchema.safeParse({ ...base, lift: 'curl' }).success).toBe(false);
    expect(recordInputSchema.safeParse({ ...base, equipment: 'wraps' }).success).toBe(false);
  });

  it('accepts every record lift, including bench_press_ac and total', () => {
    for (const lift of ['squat', 'bench_press', 'bench_press_ac', 'deadlift', 'total']) {
      expect(recordInputSchema.safeParse({ ...base, lift }).success).toBe(true);
    }
  });

  it('rejects a non-ISO date (the bulk parser normalises before this point)', () => {
    expect(recordInputSchema.safeParse({ ...base, dateSet: '15/01/2024' }).success).toBe(false);
  });
});

describe('recordUpdateSchema', () => {
  it('requires a valid id', () => {
    expect(recordUpdateSchema.safeParse(base).success).toBe(false);
    expect(recordUpdateSchema.safeParse({ ...base, id: UUID }).success).toBe(true);
  });
});

describe('recordDeleteSchema', () => {
  it('requires a valid id', () => {
    expect(recordDeleteSchema.safeParse({}).success).toBe(false);
    expect(recordDeleteSchema.safeParse({ id: UUID }).success).toBe(true);
  });
});
