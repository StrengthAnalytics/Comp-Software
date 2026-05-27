import type { Database } from '@/types/database.types';

type AttemptResult = Database['public']['Enums']['attempt_result'];

// Heaviest successful attempt in a set (one lift's three attempts, say), in kg. Returns 0 when no
// attempt was a good lift, so a lifter who bombed a lift contributes nothing to their total.
export function bestGoodLift(
  attempts: readonly { result: AttemptResult; weightKg: number | null }[],
): number {
  let best = 0;
  for (const attempt of attempts) {
    if (attempt.result === 'good_lift' && attempt.weightKg !== null && attempt.weightKg > best) {
      best = attempt.weightKg;
    }
  }
  return best;
}
