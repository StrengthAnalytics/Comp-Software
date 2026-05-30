'use server';

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { canRecordMeetResults, MEET_LOCKED_MESSAGE } from '@/lib/comps/meet-status';
import { validateAttemptWeight } from '@/lib/attempts/weight-rule';
import { toFieldErrors } from '@/lib/validation';
import {
  setAttemptResultSchema,
  setAttemptWeightSchema,
  type SetAttemptResultInput,
  type SetAttemptWeightInput,
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

// Sets an attempt's weight, creating attempts 2 and 3 on demand and updating an existing weight in
// place (the result is left untouched, so a head-table correction keeps a recorded good/no lift).
// Enforces the progression guard against the previous attempt; first attempts are unconstrained.
// Returns the attempt's id so an optimistic caller can adopt it before the realtime insert arrives.
export async function setAttemptWeightAction(input: SetAttemptWeightInput): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('setAttemptWeight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = setAttemptWeightSchema.safeParse(input);
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
      return fail('Could not set the weight. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    if (parsed.data.attemptNumber > 1) {
      const { data: previous, error: previousError } = await supabase
        .from('attempts')
        .select('weight_kg, result')
        .eq('entry_id', parsed.data.entryId)
        .eq('lift', parsed.data.lift)
        .eq('attempt_number', parsed.data.attemptNumber - 1)
        .maybeSingle();
      if (previousError) {
        Sentry.captureException(previousError);
        return fail('Could not set the weight. Please try again.');
      }
      const check = validateAttemptWeight({
        attemptNumber: parsed.data.attemptNumber,
        newWeightKg: parsed.data.weightKg,
        previousWeightKg: previous?.weight_kg ?? null,
        previousResult: previous?.result ?? null,
      });
      if (!check.ok) {
        return fail(check.message);
      }
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
      return fail('Could not set the weight. Please try again.');
    }

    // Attempt 1 IS the opener: keep the entry's opener column in step so a later weigh-in save
    // (which re-seeds attempt 1 from the opener) can't revert a platform correction. Best-effort —
    // the attempt weight is already saved.
    if (parsed.data.attemptNumber === 1) {
      const openerUpdate: Database['public']['Tables']['entries']['Update'] = {};
      if (parsed.data.lift === 'squat') {
        openerUpdate.opener_squat_kg = parsed.data.weightKg;
      } else if (parsed.data.lift === 'bench') {
        openerUpdate.opener_bench_kg = parsed.data.weightKg;
      } else {
        openerUpdate.opener_deadlift_kg = parsed.data.weightKg;
      }
      const { error: openerError } = await supabase
        .from('entries')
        .update(openerUpdate)
        .eq('id', parsed.data.entryId);
      if (openerError) {
        Sentry.captureException(openerError);
      }
    }

    return ok({ id: saved.id });
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

    // RLS cannot check that the entry belongs to the comp the client named; verify before writing.
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not record the result. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    // Find the attempt by its natural key. It may not exist yet when a result is replayed from the
    // offline outbox before its weight write landed — flushing weight ops first avoids that, but guard
    // anyway rather than recording a result against nothing.
    const { data: attempt, error: attemptError } = await supabase
      .from('attempts')
      .select('id, weight_kg, result, decided_at')
      .eq('entry_id', parsed.data.entryId)
      .eq('lift', parsed.data.lift)
      .eq('attempt_number', parsed.data.attemptNumber)
      .maybeSingle();
    if (attemptError) {
      Sentry.captureException(attemptError);
      return fail('Could not record the result. Please try again.');
    }
    if (!attempt) {
      return fail('Declare a weight before recording a result.');
    }

    // A good or no lift needs a declared weight — the bar that was attempted.
    if ((parsed.data.result === 'good_lift' || parsed.data.result === 'no_lift') && attempt.weight_kg === null) {
      return fail('Declare a weight before recording a good or no lift.');
    }

    // Stamp the decision time on a good/no lift so the run screen can anchor the 60-second
    // next-attempt countdown on it (the same instant on every device); clear it when the call is
    // reopened or set to a non-decision so the countdown cancels. Re-recording the *same* decision
    // (e.g. a duplicate press echoed from another device) keeps the original timestamp, so the
    // countdown is not silently restarted; an actual change of decision re-stamps it.
    const isDecision = parsed.data.result === 'good_lift' || parsed.data.result === 'no_lift';
    let decidedAt: string | null;
    if (!isDecision) {
      decidedAt = null;
    } else if (attempt.result === parsed.data.result && attempt.decided_at !== null) {
      decidedAt = attempt.decided_at;
    } else {
      // A genuine new/changed decision: prefer the client's mark time so a result recorded offline
      // anchors the countdown to when the operator actually marked it (the client stamps this on
      // click), falling back to now for a caller that doesn't supply one.
      decidedAt = parsed.data.decidedAt ?? new Date().toISOString();
    }

    const { error } = await supabase
      .from('attempts')
      .update({ result: parsed.data.result, decided_at: decidedAt })
      .eq('id', attempt.id);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not record the result. Please try again.');
    }

    return ok();
  });
}
