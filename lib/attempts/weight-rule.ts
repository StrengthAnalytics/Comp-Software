import type { Database } from '@/types/database.types';

type AttemptResult = Database['public']['Enums']['attempt_result'];

export type AttemptWeightCheck = {
  attemptNumber: number;
  newWeightKg: number;
  // The immediately preceding attempt (number - 1) for the same entry and lift.
  previousWeightKg: number | null;
  previousResult: AttemptResult | null;
};

export type AttemptWeightResult = { ok: true } | { ok: false; message: string };

// The scorekeeper can set any attempt's weight, with one progression guard on 2nd/3rd attempts
// (CLAUDE.md, framed for head-table corrections): after a good lift the next attempt must be heavier;
// after a no lift it must be at least the same (a repeat is allowed). First attempts — and attempts
// whose previous attempt has no good/no-lift result yet — are unconstrained, so entry errors can be
// corrected freely.
export function validateAttemptWeight(check: AttemptWeightCheck): AttemptWeightResult {
  if (check.attemptNumber <= 1 || check.previousWeightKg === null) {
    return { ok: true };
  }
  if (check.previousResult === 'good_lift' && check.newWeightKg <= check.previousWeightKg) {
    return {
      ok: false,
      message: `After a good lift, the next attempt must be heavier than ${check.previousWeightKg} kg.`,
    };
  }
  if (check.previousResult === 'no_lift' && check.newWeightKg < check.previousWeightKg) {
    return {
      ok: false,
      message: `After a failed lift, the next attempt must be at least ${check.previousWeightKg} kg.`,
    };
  }
  return { ok: true };
}
