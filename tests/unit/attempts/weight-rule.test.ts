import { describe, expect, it } from 'vitest';
import { validateAttemptWeight, type AttemptWeightCheck } from '@/lib/attempts/weight-rule';

const secondAfterGood: AttemptWeightCheck = {
  attemptNumber: 2,
  newWeightKg: 105,
  previousWeightKg: 100,
  previousResult: 'good_lift',
};

describe('validateAttemptWeight', () => {
  it('lets a first attempt be set to anything (entry-error fixes)', () => {
    expect(validateAttemptWeight({ attemptNumber: 1, newWeightKg: 50, previousWeightKg: null, previousResult: null })).toEqual({
      ok: true,
    });
  });

  it('requires a heavier weight after a good lift', () => {
    expect(validateAttemptWeight(secondAfterGood)).toEqual({ ok: true });
    expect(validateAttemptWeight({ ...secondAfterGood, newWeightKg: 100 }).ok).toBe(false);
    expect(validateAttemptWeight({ ...secondAfterGood, newWeightKg: 97.5 }).ok).toBe(false);
  });

  it('allows the same weight (a repeat) after a failed lift, but not lower', () => {
    const afterFail: AttemptWeightCheck = { ...secondAfterGood, previousResult: 'no_lift' };
    expect(validateAttemptWeight({ ...afterFail, newWeightKg: 100 })).toEqual({ ok: true });
    expect(validateAttemptWeight({ ...afterFail, newWeightKg: 102.5 })).toEqual({ ok: true });
    expect(validateAttemptWeight({ ...afterFail, newWeightKg: 97.5 }).ok).toBe(false);
  });

  it('is unconstrained when the previous attempt has no good/no-lift result yet', () => {
    expect(validateAttemptWeight({ ...secondAfterGood, newWeightKg: 80, previousResult: 'pending' })).toEqual({ ok: true });
    expect(validateAttemptWeight({ ...secondAfterGood, newWeightKg: 80, previousResult: 'not_taken' })).toEqual({ ok: true });
  });

  it('is unconstrained when there is no previous attempt weight', () => {
    expect(
      validateAttemptWeight({ attemptNumber: 3, newWeightKg: 60, previousWeightKg: null, previousResult: null }),
    ).toEqual({ ok: true });
  });

  it('applies the same guard to third attempts', () => {
    expect(
      validateAttemptWeight({ attemptNumber: 3, newWeightKg: 110, previousWeightKg: 110, previousResult: 'good_lift' }).ok,
    ).toBe(false);
  });
});
