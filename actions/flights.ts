'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { assignTeamFlightSchema, flightInputSchema, flightUpdateSchema } from '@/types/flight';
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

// Assigns a whole team to a flight (or clears it when flightId is null) by moving every member's
// entry together, so a team competition's flights are built team-by-team rather than lifter-by-lifter.
export async function assignTeamFlightAction(input: {
  teamId: string;
  competitionId: string;
  flightId: string | null;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('assignTeamFlight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = assignTeamFlightSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not move the team. Please try again.');
    }

    const supabase = await createClient();

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('competition_id')
      .eq('id', parsed.data.teamId)
      .maybeSingle();
    if (teamError) {
      Sentry.captureException(teamError);
      return fail('Could not move the team. Please try again.');
    }
    if (!team || team.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that team.');
    }

    // RLS cannot check that the target flight belongs to this comp; verify before assigning.
    if (parsed.data.flightId) {
      const { data: flight, error: flightError } = await supabase
        .from('flights')
        .select('competition_id')
        .eq('id', parsed.data.flightId)
        .maybeSingle();
      if (flightError) {
        Sentry.captureException(flightError);
        return fail('Could not move the team. Please try again.');
      }
      if (!flight || flight.competition_id !== parsed.data.competitionId) {
        return fail('Choose a flight from this competition.');
      }
    }

    const { error } = await supabase
      .from('entries')
      .update({ flight_id: parsed.data.flightId })
      .eq('team_id', parsed.data.teamId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not move the team. Please try again.');
    }

    return ok();
  });
}
