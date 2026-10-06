'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { findRotaColumnForSession, retireRotaColumn, syncRotaWithSessions } from '@/lib/rota/sync';
import { sessionInputSchema, sessionUpdateSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

function mapSessionWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A session with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the session. Please try again.');
}

// RLS cannot check that a chosen platform belongs to this comp; do it here. Returns an error result
// or null when valid (including when no platform is set).
async function validatePlatform(
  supabase: Client,
  competitionId: string,
  platformId: string | null,
): Promise<ActionResult<never> | null> {
  if (!platformId) {
    return null;
  }

  const { data, error } = await supabase
    .from('platforms')
    .select('competition_id')
    .eq('id', platformId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error);
    return fail('Could not save the session. Please try again.');
  }
  if (!data || data.competition_id !== competitionId) {
    return fail('Please fix the highlighted fields.', {
      platformId: ['Choose a platform from this competition.'],
    });
  }

  return null;
}

// Keeps the staff rota in step with the session schedule (lib/rota/sync.ts). The session save has
// already succeeded, so a rota hiccup is logged rather than reported as a failed save.
async function followSessionsInRota(
  supabase: Client,
  competitionId: string,
  options?: { addColumnFor?: readonly string[] },
): Promise<void> {
  const { error } = await syncRotaWithSessions(supabase, competitionId, options);
  if (error) {
    Sentry.captureException(error);
  }
}

export async function createSessionAction(input: {
  competitionId: string;
  name: string;
  sessionDate: string | null;
  weighInTime: string | null;
  liftOffTime: string | null;
  platformId: string | null;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createSession', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = sessionInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const invalid = await validatePlatform(supabase, parsed.data.competitionId, parsed.data.platformId);
    if (invalid) return invalid;

    const { data: created, error } = await supabase
      .from('sessions')
      .insert({
        competition_id: parsed.data.competitionId,
        name: parsed.data.name,
        session_date: parsed.data.sessionDate,
        weigh_in_time: parsed.data.weighInTime,
        lift_off_time: parsed.data.liftOffTime,
        platform_id: parsed.data.platformId,
        sort_order: parsed.data.sortOrder,
      })
      .select('id')
      .single();

    if (error || !created) {
      Sentry.captureException(error);
      return error ? mapSessionWriteError(error) : fail('Could not save the session. Please try again.');
    }

    // A rota built from the sessions gets a column for the new one too.
    await followSessionsInRota(supabase, parsed.data.competitionId, { addColumnFor: [created.id] });

    return ok();
  });
}

export async function updateSessionAction(input: {
  id: string;
  competitionId: string;
  name: string;
  sessionDate: string | null;
  weighInTime: string | null;
  liftOffTime: string | null;
  platformId: string | null;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateSession', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const competitionId = z.uuid().safeParse(input.competitionId);
    const parsed = sessionUpdateSchema.safeParse(input);
    if (!competitionId.success) {
      return fail('Could not save the session. Please try again.');
    }
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const invalid = await validatePlatform(supabase, competitionId.data, parsed.data.platformId);
    if (invalid) return invalid;

    const { error } = await supabase
      .from('sessions')
      .update({
        name: parsed.data.name,
        session_date: parsed.data.sessionDate,
        weigh_in_time: parsed.data.weighInTime,
        lift_off_time: parsed.data.liftOffTime,
        platform_id: parsed.data.platformId,
        sort_order: parsed.data.sortOrder,
      })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapSessionWriteError(error);
    }

    await followSessionsInRota(supabase, competitionId.data);

    return ok();
  });
}

// Deleting a session cascades to its flights and would silently unassign their lifters (entries
// reference flights ON DELETE SET NULL). Block the delete while any lifter is still in the session
// so the operator moves them out deliberately.
export async function deleteSessionAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteSession', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the session. Please try again.');
    }

    const supabase = await createClient();

    const { data: flights, error: flightsError } = await supabase
      .from('flights')
      .select('id')
      .eq('session_id', parsed.data.id);
    if (flightsError) {
      Sentry.captureException(flightsError);
      return fail('Could not delete the session. Please try again.');
    }

    const flightIds = (flights ?? []).map((flight) => flight.id);
    if (flightIds.length > 0) {
      const { count, error: countError } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .in('flight_id', flightIds);
      if (countError) {
        Sentry.captureException(countError);
        return fail('Could not delete the session. Please try again.');
      }
      if ((count ?? 0) > 0) {
        return fail("Move the lifters out of this session's flights before deleting it.");
      }
    }

    // Read the session's rota column first: the delete unlinks it.
    const rota = await findRotaColumnForSession(supabase, parsed.data.id);
    if (rota.error) {
      Sentry.captureException(rota.error);
    }

    const { data: deleted, error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', parsed.data.id)
      .select('competition_id')
      .maybeSingle();
    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the session. Please try again.');
    }

    if (rota.column) {
      const retired = await retireRotaColumn(supabase, rota.column);
      if (retired.error) {
        Sentry.captureException(retired.error);
      }
    }
    if (deleted) {
      await followSessionsInRota(supabase, deleted.competition_id);
    }

    return ok();
  });
}
