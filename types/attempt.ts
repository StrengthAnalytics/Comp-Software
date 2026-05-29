import { z } from 'zod';
import { ATTEMPTS_PER_LIFT } from '@/lib/constants';
import { roundToOneDecimal } from '@/lib/number-input';

const LIFT_VALUES = ['squat', 'bench', 'deadlift'] as const;

const ATTEMPT_RESULT_VALUES = ['pending', 'good_lift', 'no_lift', 'not_taken', 'withdrawn'] as const;

// numeric(5,1) in the schema: up to 9999.9, stored to one decimal place. A declared attempt always
// has a positive weight, so this is required (unlike the optional openers on the entry schema).
const weightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(9999.9, 'Weight is too large.')
  .transform(roundToOneDecimal);

// Setting an attempt's weight. Creates attempts 2 and 3 on demand and updates an existing weight in
// place (an entry-error fix keeps the attempt's result). The progression guard against the previous
// attempt is enforced in the action (see lib/attempts/weight-rule.ts).
export const setAttemptWeightSchema = z.object({
  competitionId: z.uuid(),
  entryId: z.uuid(),
  lift: z.enum(LIFT_VALUES),
  attemptNumber: z.number().int().min(1).max(ATTEMPTS_PER_LIFT),
  weightKg,
});
export type SetAttemptWeightInput = z.infer<typeof setAttemptWeightSchema>;

// Recording (or overturning) an attempt's result. Any result is accepted so an operator can correct
// a call — including back to 'pending' to reopen it.
export const setAttemptResultSchema = z.object({
  competitionId: z.uuid(),
  attemptId: z.uuid(),
  result: z.enum(ATTEMPT_RESULT_VALUES),
});
export type SetAttemptResultInput = z.infer<typeof setAttemptResultSchema>;
