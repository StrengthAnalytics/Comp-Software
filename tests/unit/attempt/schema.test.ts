import { describe, expect, it } from 'vitest';
import {
  changeAttemptWeightSchema,
  declareAttemptSchema,
  setAttemptResultSchema,
} from '@/types/attempt';

const uuid = '00000000-0000-0000-0000-000000000000';

describe('declareAttemptSchema', () => {
  it('accepts a valid declaration and rounds the weight to one decimal', () => {
    const parsed = declareAttemptSchema.parse({
      competitionId: uuid,
      entryId: uuid,
      lift: 'squat',
      attemptNumber: 2,
      weightKg: 100.04,
    });
    expect(parsed.weightKg).toBe(100);
  });

  it('rejects an attempt number outside 1–3', () => {
    expect(
      declareAttemptSchema.safeParse({
        competitionId: uuid,
        entryId: uuid,
        lift: 'bench',
        attemptNumber: 4,
        weightKg: 100,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-positive weight', () => {
    expect(
      declareAttemptSchema.safeParse({
        competitionId: uuid,
        entryId: uuid,
        lift: 'deadlift',
        attemptNumber: 1,
        weightKg: 0,
      }).success,
    ).toBe(false);
  });
});

describe('changeAttemptWeightSchema', () => {
  it('accepts a valid change', () => {
    expect(
      changeAttemptWeightSchema.safeParse({ competitionId: uuid, attemptId: uuid, weightKg: 110 }).success,
    ).toBe(true);
  });
});

describe('setAttemptResultSchema', () => {
  it('accepts each valid result', () => {
    for (const result of ['pending', 'good_lift', 'no_lift', 'not_taken', 'withdrawn'] as const) {
      expect(setAttemptResultSchema.safeParse({ competitionId: uuid, attemptId: uuid, result }).success).toBe(true);
    }
  });

  it('rejects an unknown result', () => {
    expect(
      setAttemptResultSchema.safeParse({ competitionId: uuid, attemptId: uuid, result: 'bogus' }).success,
    ).toBe(false);
  });
});
