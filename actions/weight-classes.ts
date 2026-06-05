'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { weightClassInputSchema, weightClassUpdateSchema } from '@/types/competition';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import { defaultWeightClassRows } from '@/lib/comps/seed-defaults';

function mapWeightClassWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A weight class with that name already exists.', {
      name: ['That name is already used.'],
    });
  }
  return fail('Could not save the weight class. Please try again.');
}

export async function createWeightClassAction(input: {
  competitionId: string;
  name: string;
  gender: 'male' | 'female';
  lowerKg: number;
  upperKg: number | null;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createWeightClass', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = weightClassInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase.from('weight_classes').insert({
      competition_id: parsed.data.competitionId,
      name: parsed.data.name,
      gender: parsed.data.gender,
      lower_kg: parsed.data.lowerKg,
      upper_kg: parsed.data.upperKg,
      sort_order: parsed.data.sortOrder,
    });

    if (error) {
      Sentry.captureException(error);
      return mapWeightClassWriteError(error);
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

export async function updateWeightClassAction(input: {
  id: string;
  competitionId: string;
  name: string;
  gender: 'male' | 'female';
  lowerKg: number;
  upperKg: number | null;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateWeightClass', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const competitionId = z.uuid().safeParse(input.competitionId);
    const parsed = weightClassUpdateSchema.safeParse(input);
    if (!competitionId.success) {
      return fail('Could not save the weight class. Please try again.');
    }
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('weight_classes')
      .update({
        name: parsed.data.name,
        gender: parsed.data.gender,
        lower_kg: parsed.data.lowerKg,
        upper_kg: parsed.data.upperKg,
        sort_order: parsed.data.sortOrder,
      })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapWeightClassWriteError(error);
    }

    revalidatePath(`/comps/${competitionId.data}/edit`);
    return ok();
  });
}

export async function deleteWeightClassAction(input: {
  id: string;
  competitionId: string;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteWeightClass', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid(), competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the weight class. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase.from('weight_classes').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the weight class. Please try again.');
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

// Inserts the standard IPF classic open weight classes. Idempotent: existing names are skipped.
export async function seedDefaultWeightClassesAction(competitionId: string): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('seedDefaultWeightClasses', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const id = z.uuid().safeParse(competitionId);
    if (!id.success) {
      return fail('Could not seed weight classes. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('weight_classes')
      .upsert(defaultWeightClassRows(id.data), { onConflict: 'competition_id,name', ignoreDuplicates: true });

    if (error) {
      Sentry.captureException(error);
      return fail('Could not seed weight classes. Please try again.');
    }

    revalidatePath(`/comps/${id.data}/edit`);
    return ok();
  });
}
