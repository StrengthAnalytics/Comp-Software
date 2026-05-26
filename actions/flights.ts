'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { flightInputSchema, flightUpdateSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

function mapFlightWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A flight with that name already exists in this session.', {
      name: ['That name is already used in this session.'],
    });
  }
  return fail('Could not save the flight. Please try again.');
}

export async function createFlightAction(input: {
  competitionId: string;
  sessionId: string;
  name: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createFlight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = flightInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    // RLS cannot check that the session belongs to this comp; verify before inserting.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('competition_id')
      .eq('id', parsed.data.sessionId)
      .maybeSingle();
    if (sessionError) {
      Sentry.captureException(sessionError);
      return fail('Could not save the flight. Please try again.');
    }
    if (!session || session.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that session.');
    }

    const { error } = await supabase.from('flights').insert({
      competition_id: parsed.data.competitionId,
      session_id: parsed.data.sessionId,
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder,
    });

    if (error) {
      Sentry.captureException(error);
      return mapFlightWriteError(error);
    }

    return ok();
  });
}

export async function updateFlightAction(input: {
  id: string;
  name: string;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateFlight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = flightUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('flights')
      .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapFlightWriteError(error);
    }

    return ok();
  });
}

// A lifter assigned to a flight would be silently unassigned by the delete (entries reference
// flights ON DELETE SET NULL). Block it while the flight still holds lifters.
export async function deleteFlightAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteFlight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the flight. Please try again.');
    }

    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('flight_id', parsed.data.id);
    if (countError) {
      Sentry.captureException(countError);
      return fail('Could not delete the flight. Please try again.');
    }
    if ((count ?? 0) > 0) {
      return fail('Move the lifters out of this flight before deleting it.');
    }

    const { error } = await supabase.from('flights').delete().eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the flight. Please try again.');
    }

    return ok();
  });
}
