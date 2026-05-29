import type { Database } from '@/types/database.types';
import { MIN_ATTEMPT_INCREMENT_KG, NEXT_ATTEMPT_TIMER_SECONDS } from '@/lib/constants';
import { roundToOneDecimal } from '@/lib/number-input';

type AttemptResult = Database['public']['Enums']['attempt_result'];

// The IPF default weight for a lifter's next attempt when the 60-second clock expires without a
// declared weight: the smallest legal increase (+2.5 kg) after a good lift, or a repeat of the same
// weight after a no lift. Returns null when there is no automatic default — the previous attempt was
// not a good/no lift (e.g. still pending, not taken, withdrawn) or had no declared weight.
export function autoNextAttemptWeight(
  previousResult: AttemptResult | null,
  previousWeightKg: number | null,
): number | null {
  if (previousWeightKg === null) {
    return null;
  }
  if (previousResult === 'good_lift') {
    return roundToOneDecimal(previousWeightKg + MIN_ATTEMPT_INCREMENT_KG);
  }
  if (previousResult === 'no_lift') {
    return previousWeightKg;
  }
  return null;
}

// Minimal shape the countdown needs from the previous attempt (number − 1, same lift) and the next
// attempt being timed.
type PreviousAttempt = { result: AttemptResult; weightKg: number | null; decidedAt: string | null };
type NextAttempt = { weightKg: number | null } | undefined;

export type NextAttemptCountdown = { autoWeight: number; deadlineMs: number };

// Whether the next attempt's cell should run the 60-second countdown, and with what default. A
// countdown exists only when: the next attempt has no declared weight yet (an already-declared next
// attempt shows its weight, no timer); the previous attempt has been decided (decided_at set) as a
// good/no lift with a weight; and that yields an automatic default. The deadline is decided_at +
// 60s as epoch milliseconds, so every device counts down to the same instant. Returns null when no
// countdown applies. Pure; unit-tested.
export function nextAttemptCountdown(
  previous: PreviousAttempt | undefined,
  next: NextAttempt,
): NextAttemptCountdown | null {
  if (next?.weightKg != null) {
    return null;
  }
  if (!previous || previous.decidedAt === null) {
    return null;
  }
  const autoWeight = autoNextAttemptWeight(previous.result, previous.weightKg);
  if (autoWeight === null) {
    return null;
  }
  const decidedMs = Date.parse(previous.decidedAt);
  if (Number.isNaN(decidedMs)) {
    return null;
  }
  return { autoWeight, deadlineMs: decidedMs + NEXT_ATTEMPT_TIMER_SECONDS * 1000 };
}
