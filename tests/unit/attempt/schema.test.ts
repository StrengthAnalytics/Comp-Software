import { describe, expect, it } from 'vitest';
import { setAttemptResultSchema, setAttemptWeightSchema } from '@/types/attempt';

const uuid = '00000000-0000-0000-0000-000000000000';

describe('setAttemptWeightSchema', () => {
  it('accepts a valid weight and rounds to one decimal', () => {
    const parsed = setAttemptWeightSchema.parse({
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
      setAttemptWeightSchema.safeParse({
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
      setAttemptWeightSchema.safeParse({
        competitionId: uuid,
        entryId: uuid,
        lift: 'deadlift',
        attemptNumber: 1,
        weightKg: 0,
      }).success,
    ).toBe(false);
  });
});

describe('setAttemptResultSchema', () => {
  it('accepts each valid result keyed by the attempt natural key', () => {
    for (const result of ['pending', 'good_lift', 'no_lift', 'not_taken', 'withdrawn'] as const) {
      expect(
        setAttemptResultSchema.safeParse({
          competitionId: uuid,
          entryId: uuid,
          lift: 'squat',
          attemptNumber: 1,
          result,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown result', () => {
    expect(
      setAttemptResultSchema.safeParse({
        competitionId: uuid,
        entryId: uuid,
        lift: 'squat',
        attemptNumber: 1,
        result: 'bogus',
      }).success,
    ).toBe(false);
  });

  it('rejects an attempt number outside 1–3', () => {
    expect(
      setAttemptResultSchema.safeParse({
        competitionId: uuid,
        entryId: uuid,
        lift: 'bench',
        attemptNumber: 4,
        result: 'good_lift',
      }).success,
    ).toBe(false);
  });
});
