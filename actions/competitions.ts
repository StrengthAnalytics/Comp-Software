'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { competitionInputSchema } from '@/types/competition';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';

export type CompetitionFormState = ActionResult;

function readCompetitionForm(formData: FormData) {
  return {
    name: formData.get('name'),
    slug: formData.get('slug'),
    kit_type: formData.get('kit_type'),
    event_type: formData.get('event_type'),
    status: formData.get('status'),
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('ends_on'),
    is_team_competition: formData.get('is_team_competition') === 'on',
  };
}

function mapCompetitionWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A competition with that slug already exists.', {
      slug: ['That slug is already taken.'],
    });
  }
  return fail('Could not save the competition. Please try again.');
}

export async function createCompetitionAction(
  _previous: CompetitionFormState | null,
  formData: FormData,
): Promise<CompetitionFormState> {
  return Sentry.withServerActionInstrumentation('createCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = competitionInputSchema.safeParse(readCompetitionForm(formData));
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('competitions')
      .insert(parsed.data)
      .select('id')
      .single();

    if (error) {
      Sentry.captureException(error);
      return mapCompetitionWriteError(error);
    }

    revalidatePath('/comps');
    redirect(`/comps/${data.id}/edit`);
  });
}

export async function updateCompetitionAction(
  _previous: CompetitionFormState | null,
  formData: FormData,
): Promise<CompetitionFormState> {
  return Sentry.withServerActionInstrumentation('updateCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const id = z.uuid().safeParse(formData.get('id'));
    if (!id.success) {
      return fail('Could not save the competition. Please try again.');
    }

    const parsed = competitionInputSchema.safeParse(readCompetitionForm(formData));
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase.from('competitions').update(parsed.data).eq('id', id.data);

    if (error) {
      Sentry.captureException(error);
      return mapCompetitionWriteError(error);
    }

    revalidatePath('/comps');
    revalidatePath(`/comps/${id.data}/edit`);
    return ok();
  });
}
