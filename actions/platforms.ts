'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { syncRotaWithSessions } from '@/lib/rota/sync';
import { resequenceSessions } from '@/lib/sessions/sequence';
import { platformInputSchema, platformUpdateSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

function mapPlatformWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A platform with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the platform. Please try again.');
}

// The platform name breaks ties in the sessions' time order, and the rota's session column headers
// name the platform when a comp runs more than one, so a rename or delete re-sequences the sessions
// (lib/sessions/sequence.ts) and is passed on to the rota (lib/rota/sync.ts). The platform write has
// already succeeded; a hiccup in either is logged rather than reported as a failed save.
async function followPlatformsInRota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<void> {
  const resequenced = await resequenceSessions(supabase, competitionId);
  if (resequenced.error) {
    Sentry.captureException(resequenced.error);
  }
  const { error } = await syncRotaWithSessions(supabase, competitionId);
  if (error) {
    Sentry.captureException(error);
  }
}

export async function createPlatformAction(input: {
  competitionId: string;
  name: string;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createPlatform', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = platformInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('platforms')
      .insert({ competition_id: parsed.data.competitionId, name: parsed.data.name });

    if (error) {
      Sentry.captureException(error);
      return mapPlatformWriteError(error);
    }

    // A second platform puts the platform name into every session column's header.
    await followPlatformsInRota(supabase, parsed.data.competitionId);
    return ok();
  });
}

export async function updatePlatformAction(input: { id: string; name: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updatePlatform', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = platformUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from('platforms')
      .update({ name: parsed.data.name })
      .eq('id', parsed.data.id)
      .select('competition_id')
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return mapPlatformWriteError(error);
    }

    if (updated) {
      await followPlatformsInRota(supabase, updated.competition_id);
    }

    return ok();
  });
}

// Sessions reference platforms with ON DELETE SET NULL, so removing a platform simply unsets it on
// any session that used it — no orphaned rows.
export async function deletePlatformAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deletePlatform', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the platform. Please try again.');
    }

    const supabase = await createClient();
    const { data: deleted, error } = await supabase
      .from('platforms')
      .delete()
      .eq('id', parsed.data.id)
      .select('competition_id')
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the platform. Please try again.');
    }

    if (deleted) {
      await followPlatformsInRota(supabase, deleted.competition_id);
    }

    return ok();
  });
}
