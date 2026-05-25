'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { divisionInputSchema, divisionUpdateSchema } from '@/types/competition';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import { DEFAULT_DIVISIONS } from '@/lib/constants';

function mapDivisionWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A division with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the division. Please try again.');
}

export async function createDivisionAction(input: {
  competitionId: string;
  name: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createDivision', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = divisionInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase.from('divisions').insert({
      competition_id: parsed.data.competitionId,
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder,
    });

    if (error) {
      Sentry.captureException(error);
      return mapDivisionWriteError(error);
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

export async function updateDivisionAction(input: {
  id: string;
  competitionId: string;
  name: string;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateDivision', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const competitionId = z.uuid().safeParse(input.competitionId);
    const parsed = divisionUpdateSchema.safeParse(input);
    if (!competitionId.success) {
      return fail('Could not save the division. Please try again.');
    }
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('divisions')
      .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapDivisionWriteError(error);
    }

    revalidatePath(`/comps/${competitionId.data}/edit`);
    return ok();
  });
}

export async function deleteDivisionAction(input: {
  id: string;
  competitionId: string;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteDivision', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid(), competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the division. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase.from('divisions').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the division. Please try again.');
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

// Inserts the standard IPF age divisions. Idempotent: existing names are skipped, so re-running
// after manual edits will not error or duplicate.
export async function seedDefaultDivisionsAction(competitionId: string): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('seedDefaultDivisions', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const id = z.uuid().safeParse(competitionId);
    if (!id.success) {
      return fail('Could not seed divisions. Please try again.');
    }

    const supabase = await createClient();
    const rows = DEFAULT_DIVISIONS.map((name, index) => ({
      competition_id: id.data,
      name,
      sort_order: index,
    }));
    const { error } = await supabase
      .from('divisions')
      .upsert(rows, { onConflict: 'competition_id,name', ignoreDuplicates: true });

    if (error) {
      Sentry.captureException(error);
      return fail('Could not seed divisions. Please try again.');
    }

    revalidatePath(`/comps/${id.data}/edit`);
    return ok();
  });
}
