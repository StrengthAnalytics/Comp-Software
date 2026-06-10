'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { ageCategoryInputSchema, ageCategoryUpdateSchema } from '@/types/competition';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import { defaultAgeCategoryRows } from '@/lib/comps/seed-defaults';
import { requireEditableCategories } from '@/lib/comps/category-guard';

function mapAgeCategoryWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('An age category with that name already exists.', { name: ['That name is already used.'] });
  }
  return fail('Could not save the age category. Please try again.');
}

export async function createAgeCategoryAction(input: {
  competitionId: string;
  name: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createAgeCategory', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = ageCategoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const locked = await requireEditableCategories(supabase, parsed.data.competitionId);
    if (locked) return locked;

    const { error } = await supabase.from('age_categories').insert({
      competition_id: parsed.data.competitionId,
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder,
    });

    if (error) {
      Sentry.captureException(error);
      return mapAgeCategoryWriteError(error);
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

export async function updateAgeCategoryAction(input: {
  id: string;
  competitionId: string;
  name: string;
  sortOrder: number;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateAgeCategory', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const competitionId = z.uuid().safeParse(input.competitionId);
    const parsed = ageCategoryUpdateSchema.safeParse(input);
    if (!competitionId.success) {
      return fail('Could not save the age category. Please try again.');
    }
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const locked = await requireEditableCategories(supabase, competitionId.data);
    if (locked) return locked;

    const { error } = await supabase
      .from('age_categories')
      .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapAgeCategoryWriteError(error);
    }

    revalidatePath(`/comps/${competitionId.data}/edit`);
    return ok();
  });
}

export async function deleteAgeCategoryAction(input: {
  id: string;
  competitionId: string;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteAgeCategory', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid(), competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the age category. Please try again.');
    }

    const supabase = await createClient();
    const locked = await requireEditableCategories(supabase, parsed.data.competitionId);
    if (locked) return locked;

    const { error } = await supabase.from('age_categories').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the age category. Please try again.');
    }

    revalidatePath(`/comps/${parsed.data.competitionId}/edit`);
    return ok();
  });
}

// Inserts the standard IPF age categories. Idempotent: existing names are skipped, so re-running
// after manual edits will not error or duplicate.
export async function seedDefaultAgeCategoriesAction(competitionId: string): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('seedDefaultAgeCategories', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const id = z.uuid().safeParse(competitionId);
    if (!id.success) {
      return fail('Could not seed age categories. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('age_categories')
      .upsert(defaultAgeCategoryRows(id.data), { onConflict: 'competition_id,name', ignoreDuplicates: true });

    if (error) {
      Sentry.captureException(error);
      return fail('Could not seed age categories. Please try again.');
    }

    revalidatePath(`/comps/${id.data}/edit`);
    return ok();
  });
}
