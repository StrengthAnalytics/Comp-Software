'use server';

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { canRecordMeetResults, MEET_LOCKED_MESSAGE } from '@/lib/comps/meet-status';
import { validateWeightChange } from '@/lib/attempts/weight-change';
import { toFieldErrors } from '@/lib/validation';
import {
  changeAttemptWeightSchema,
  declareAttemptSchema,
  setAttemptResultSchema,
  type ChangeAttemptWeightInput,
  type DeclareAttemptInput,
  type SetAttemptResultInput,
} from '@/types/attempt';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// Blocks meet-time writes once a comp is completed (Phase 0 guard). Returns an error result to return
// immediately, or null when the comp is writable.
async function requireWritableComp(
  supabase: Client,
  competitionId: string,
): Promise<ActionResult<never> | null> {
  const { data: comp, error } = await supabase
    .from('competitions')
    .select('status')
    .eq('id', competitionId)
    .maybeSingle();
  if (error) {
    Sentry.captureException(error);
    return fail('Could not save. Please try again.');
  }
  if (!comp) {
    return fail('Could not find that competition.');
  }
  if (!canRecordMeetResults(comp.status)) {
    return fail(MEET_LOCKED_MESSAGE);
  }
  return null;
}

// Declares (first-sets) an attempt's weight, creating attempts 2 and 3 on demand. An attempt that
// already has a weight must be increased via changeAttemptWeightAction so the one-increase rule holds.
// Returns the attempt's id so an optimistic caller can adopt it before the realtime insert arrives.
export async function declareAttemptAction(input: DeclareAttemptInput): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('declareAttempt', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = declareAttemptSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const locked = await requireWritableComp(supabase, parsed.data.competitionId);
    if (locked) return locked;

    // RLS cannot check that the entry belongs to the comp the client named; verify before writing.
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not declare the attempt. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    const { data: existing, error: existingError } = await supabase
      .from('attempts')
      .select('weight_kg')
      .eq('entry_id', parsed.data.entryId)
      .eq('lift', parsed.data.lift)
      .eq('attempt_number', parsed.data.attemptNumber)
      .maybeSingle();
    if (existingError) {
      Sentry.captureException(existingError);
      return fail('Could not declare the attempt. Please try again.');
    }
    if (existing && existing.weight_kg !== null) {
      return fail('That attempt is already declared. Use a weight change to increase it.');
    }

    const { data: saved, error } = await supabase
      .from('attempts')
      .upsert(
        {
          competition_id: parsed.data.competitionId,
          entry_id: parsed.data.entryId,
          lift: parsed.data.lift,
          attempt_number: parsed.data.attemptNumber,
          weight_kg: parsed.data.weightKg,
          declared_at: new Date().toISOString(),
        },
        { onConflict: 'entry_id,lift,attempt_number' },
      )
      .select('id')
      .single();
    if (error || !saved) {
      Sentry.captureException(error);
      return fail('Could not declare the attempt. Please try again.');
    }

    return ok({ id: saved.id });
  });
}

// Increases an already-declared attempt's weight, enforcing the one-increase rule (attempts 2 and 3,
// pending only, no decrease, once).
export async function changeAttemptWeightAction(input: ChangeAttemptWeightInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('changeAttemptWeight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = changeAttemptWeightSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const locked = await requireWritableComp(supabase, parsed.data.competitionId);
    if (locked) return locked;

    const { data: attempt, error: attemptError } = await supabase
      .from('attempts')
      .select('competition_id, attempt_number, weight_kg, weight_changes, result')
      .eq('id', parsed.data.attemptId)
      .maybeSingle();
    if (attemptError) {
      Sentry.captureException(attemptError);
      return fail('Could not change the weight. Please try again.');
    }
    if (!attempt || attempt.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that attempt.');
    }

    const check = validateWeightChange({
      attemptNumber: attempt.attempt_number,
      currentWeightKg: attempt.weight_kg,
      newWeightKg: parsed.data.weightKg,
      weightChanges: attempt.weight_changes,
      result: attempt.result,
    });
    if (!check.ok) {
      return fail(check.message);
    }

    const { error } = await supabase
      .from('attempts')
      .update({
        weight_kg: parsed.data.weightKg,
        weight_changes: attempt.weight_changes + 1,
        declared_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.attemptId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not change the weight. Please try again.');
    }

    return ok();
  });
}

// Records or overturns an attempt's result. Any value is accepted (including 'pending' to reopen a
// call), so a jury reversal is just another result write — there is no one-way lock except a
// completed comp.
export async function setAttemptResultAction(input: SetAttemptResultInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('setAttemptResult', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = setAttemptResultSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not record the result. Please try again.');
    }

    const supabase = await createClient();

    const locked = await requireWritableComp(supabase, parsed.data.competitionId);
    if (locked) return locked;

    const { data: attempt, error: attemptError } = await supabase
      .from('attempts')
      .select('competition_id, weight_kg')
      .eq('id', parsed.data.attemptId)
      .maybeSingle();
    if (attemptError) {
      Sentry.captureException(attemptError);
      return fail('Could not record the result. Please try again.');
    }
    if (!attempt || attempt.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that attempt.');
    }

    // A good or no lift needs a declared weight — the bar that was attempted.
    if ((parsed.data.result === 'good_lift' || parsed.data.result === 'no_lift') && attempt.weight_kg === null) {
      return fail('Declare a weight before recording a good or no lift.');
    }

    const { error } = await supabase
      .from('attempts')
      .update({ result: parsed.data.result })
      .eq('id', parsed.data.attemptId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not record the result. Please try again.');
    }

    return ok();
  });
}
