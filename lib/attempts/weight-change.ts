import type { Database } from '@/types/database.types';
import { MAX_ATTEMPT_WEIGHT_CHANGES } from '@/lib/constants';

type AttemptResult = Database['public']['Enums']['attempt_result'];

export type WeightChangeCheck = {
  attemptNumber: number;
  currentWeightKg: number | null;
  newWeightKg: number;
  weightChanges: number;
  result: AttemptResult;
};

export type WeightChangeResult = { ok: true } | { ok: false; message: string };

// Validates a weight change against the IPF rule (CLAUDE.md): once declared, a weight increase is
// allowed only on attempts 2 and 3, only while the attempt is still pending, only as an increase,
// and only once. Attempt 1 is the opener (set at weigh-in) and is not changed through this path.
export function validateWeightChange(check: WeightChangeCheck): WeightChangeResult {
  if (check.attemptNumber !== 2 && check.attemptNumber !== 3) {
    return { ok: false, message: 'Only second and third attempts can have their weight changed.' };
  }
  if (check.result !== 'pending') {
    return { ok: false, message: 'This attempt already has a result, so its weight is locked.' };
  }
  if (check.currentWeightKg === null) {
    return { ok: false, message: 'Declare a weight for this attempt before changing it.' };
  }
  if (check.weightChanges >= MAX_ATTEMPT_WEIGHT_CHANGES) {
    return { ok: false, message: 'This attempt has already used its one weight change.' };
  }
  if (check.newWeightKg <= check.currentWeightKg) {
    return { ok: false, message: 'A weight change must increase the weight, not lower it.' };
  }
  return { ok: true };
}
