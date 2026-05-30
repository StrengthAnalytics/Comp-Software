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

// Recording (or overturning) an attempt's result. Keyed by the attempt's natural key (entry + lift +
// attempt number) rather than its database id, so an attempt created offline — which has no server id
// yet — can still have a result recorded and synced on reconnect. Any result is accepted so an
// operator can correct a call, including back to 'pending' to reopen it.
//
// `decidedAt` is the moment the operator marked the call, supplied by the client so a good/no lift
// recorded offline anchors the next-attempt countdown to when it was actually marked rather than to
// the reconnect time the server would otherwise stamp. Optional (older/other callers omit it) and only
// honoured for a genuine new/changed decision — see setAttemptResultAction.
export const setAttemptResultSchema = z.object({
  competitionId: z.uuid(),
  entryId: z.uuid(),
  lift: z.enum(LIFT_VALUES),
  attemptNumber: z.number().int().min(1).max(ATTEMPTS_PER_LIFT),
  result: z.enum(ATTEMPT_RESULT_VALUES),
  decidedAt: z.iso.datetime().nullable().optional(),
});
export type SetAttemptResultInput = z.infer<typeof setAttemptResultSchema>;
