'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { platformInputSchema, platformUpdateSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

function mapPlatformWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A platform with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the platform. Please try again.');
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
    const { error } = await supabase.from('platforms').update({ name: parsed.data.name }).eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapPlatformWriteError(error);
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
    const { error } = await supabase.from('platforms').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the platform. Please try again.');
    }

    return ok();
  });
}
