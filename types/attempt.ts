import { z } from 'zod';
import { ATTEMPTS_PER_LIFT } from '@/lib/constants';

const LIFT_VALUES = ['squat', 'bench', 'deadlift'] as const;

const ATTEMPT_RESULT_VALUES = ['pending', 'good_lift', 'no_lift', 'not_taken', 'withdrawn'] as const;

// numeric(5,1) in the schema: up to 9999.9, stored to one decimal place. A declared attempt always
// has a positive weight, so this is required (unlike the optional openers on the entry schema).
const weightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(9999.9, 'Weight is too large.')
  .transform((value) => Math.round(value * 10) / 10);

// Declaring (first-setting) an attempt's weight. Attempts 2 and 3 are created on declaration; the
// action rejects re-declaring an attempt that already has a weight (that path is a weight change).
export const declareAttemptSchema = z.object({
  competitionId: z.uuid(),
  entryId: z.uuid(),
  lift: z.enum(LIFT_VALUES),
  attemptNumber: z.number().int().min(1).max(ATTEMPTS_PER_LIFT),
  weightKg,
});
export type DeclareAttemptInput = z.infer<typeof declareAttemptSchema>;

// Changing an already-declared weight. The one-increase rule is enforced in the action against the
// attempt's stored weight and change count (see lib/attempts/weight-change.ts).
export const changeAttemptWeightSchema = z.object({
  competitionId: z.uuid(),
  attemptId: z.uuid(),
  weightKg,
});
export type ChangeAttemptWeightInput = z.infer<typeof changeAttemptWeightSchema>;

// Recording (or overturning) an attempt's result. Any result is accepted so an operator can correct
// a call — including back to 'pending' to reopen it.
export const setAttemptResultSchema = z.object({
  competitionId: z.uuid(),
  attemptId: z.uuid(),
  result: z.enum(ATTEMPT_RESULT_VALUES),
});
export type SetAttemptResultInput = z.infer<typeof setAttemptResultSchema>;
