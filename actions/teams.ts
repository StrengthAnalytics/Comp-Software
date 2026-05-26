'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { assignTeamSchema, teamInputSchema, teamUpdateSchema } from '@/types/team';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

function mapTeamWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A team with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the team. Please try again.');
}

export async function createTeamAction(input: {
  competitionId: string;
  name: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createTeam', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = teamInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('teams')
      .insert({ competition_id: parsed.data.competitionId, name: parsed.data.name, sort_order: parsed.data.sortOrder });

    if (error) {
      Sentry.captureException(error);
      return mapTeamWriteError(error);
    }

    return ok();
  });
}

export async function updateTeamAction(input: {
  id: string;
  name: string;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateTeam', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = teamUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('teams')
      .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapTeamWriteError(error);
    }

    return ok();
  });
}

// Unassign the members first (both team_id and team_lift together) before deleting the team. The
// teams FK is ON DELETE SET NULL, which would null only team_id and leave team_lift set — tripping
// the entries_team_role_together check. Clearing both up front keeps the delete clean.
export async function deleteTeamAction(input: { id: string; competitionId: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteTeam', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid(), competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the team. Please try again.');
    }

    const supabase = await createClient();

    const { error: clearError } = await supabase
      .from('entries')
      .update({ team_id: null, team_lift: null })
      .eq('team_id', parsed.data.id);
    if (clearError) {
      Sentry.captureException(clearError);
      return fail('Could not delete the team. Please try again.');
    }

    const { error } = await supabase.from('teams').delete().eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the team. Please try again.');
    }

    return ok();
  });
}

// Assigns an entry to a team in one lift role, or clears it (teamId and teamLift both null). Mirrors
// assignEntryFlightAction: the teams board fires this with optimistic local state.
export async function assignEntryTeamAction(input: {
  entryId: string;
  competitionId: string;
  teamId: string | null;
  teamLift: 'squat' | 'bench' | 'deadlift' | null;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('assignEntryTeam', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = assignTeamSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not update the team. Please try again.');
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not update the team. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    // RLS cannot check that the target team belongs to this comp; verify before assigning.
    if (parsed.data.teamId) {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('competition_id')
        .eq('id', parsed.data.teamId)
        .maybeSingle();
      if (teamError) {
        Sentry.captureException(teamError);
        return fail('Could not update the team. Please try again.');
      }
      if (!team || team.competition_id !== parsed.data.competitionId) {
        return fail('Choose a team from this competition.');
      }
    }

    const { error } = await supabase
      .from('entries')
      .update({ team_id: parsed.data.teamId, team_lift: parsed.data.teamLift })
      .eq('id', parsed.data.entryId);

    if (error) {
      if (isUniqueViolation(error)) {
        return fail('That lift is already filled on this team.');
      }
      Sentry.captureException(error);
      return fail('Could not update the team. Please try again.');
    }

    return ok();
  });
}
