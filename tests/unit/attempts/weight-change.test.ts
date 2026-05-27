import { describe, expect, it } from 'vitest';
import { validateWeightChange, type WeightChangeCheck } from '@/lib/attempts/weight-change';

const valid: WeightChangeCheck = {
  attemptNumber: 2,
  currentWeightKg: 100,
  newWeightKg: 105,
  weightChanges: 0,
  result: 'pending',
};

describe('validateWeightChange', () => {
  it('allows a first increase on a pending second attempt', () => {
    expect(validateWeightChange(valid)).toEqual({ ok: true });
  });

  it('allows a first increase on a pending third attempt', () => {
    expect(validateWeightChange({ ...valid, attemptNumber: 3 })).toEqual({ ok: true });
  });

  it('rejects a change to the first attempt (the opener)', () => {
    const result = validateWeightChange({ ...valid, attemptNumber: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a change once the attempt has a result', () => {
    expect(validateWeightChange({ ...valid, result: 'good_lift' }).ok).toBe(false);
    expect(validateWeightChange({ ...valid, result: 'no_lift' }).ok).toBe(false);
  });

  it('rejects a change before the attempt has been declared', () => {
    expect(validateWeightChange({ ...valid, currentWeightKg: null }).ok).toBe(false);
  });

  it('rejects a second change', () => {
    expect(validateWeightChange({ ...valid, weightChanges: 1 }).ok).toBe(false);
  });

  it('rejects a decrease', () => {
    expect(validateWeightChange({ ...valid, newWeightKg: 95 }).ok).toBe(false);
  });

  it('rejects the same weight (a change must increase)', () => {
    expect(validateWeightChange({ ...valid, newWeightKg: 100 }).ok).toBe(false);
  });
});
