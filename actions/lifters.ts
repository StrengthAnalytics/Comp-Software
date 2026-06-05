'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { lifterInputSchema, lifterSearchSchema, lifterUpdateSchema, type LifterInput } from '@/types/entry';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

export type LifterSearchResult = Pick<
  Database['public']['Tables']['lifters']['Row'],
  'id' | 'first_name' | 'surname' | 'gender' | 'date_of_birth' | 'ipf_member_id' | 'club' | 'country'
>;

const SEARCH_LIMIT = 20;

const LIFTER_FIELDS = 'id, first_name, surname, gender, date_of_birth, ipf_member_id, club, country';

function toRow(input: LifterInput) {
  return {
    first_name: input.first_name,
    surname: input.surname,
    gender: input.gender,
    date_of_birth: input.date_of_birth,
    ipf_member_id: input.ipf_member_id,
    club: input.club,
    country: input.country,
  };
}

// Surname is the search key: membership numbers change year to year, so surname is the only stable
// handle for finding a returning lifter. Matches are case-insensitive and substring.
export async function searchLiftersAction(query: string): Promise<ActionResult<LifterSearchResult[]>> {
  return Sentry.withServerActionInstrumentation('searchLifters', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = lifterSearchSchema.safeParse({ query });
    if (!parsed.success) {
      return fail('Enter a surname to search.');
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lifters')
      .select(LIFTER_FIELDS)
      .ilike('surname', `%${parsed.data.query}%`)
      .order('surname', { ascending: true })
      .order('first_name', { ascending: true })
      .limit(SEARCH_LIMIT);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not search lifters. Please try again.');
    }

    return ok(data);
  });
}

export async function createLifterAction(input: LifterInput): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('createLifter', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = lifterInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from('lifters').insert(toRow(parsed.data)).select('id').single();

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the lifter. Please try again.');
    }

    return ok({ id: data.id });
  });
}

// Deletes a lifter. Used to roll back a just-created lifter when registering them for a comp fails, so
// the New-lifter flow can't leave an orphaned (entry-less) lifter behind. The lifters → entries FK is
// ON DELETE RESTRICT, so this only succeeds while the lifter has no entries — exactly the rollback
// case; a lifter with registrations is protected by that constraint.
export async function deleteLifterAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteLifter', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not remove the lifter. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase.from('lifters').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not remove the lifter. Please try again.');
    }

    return ok();
  });
}

export async function updateLifterAction(input: { id: string } & LifterInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateLifter', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = lifterUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { id, ...fields } = parsed.data;
    const { error } = await supabase.from('lifters').update(toRow(fields)).eq('id', id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the lifter. Please try again.');
    }

    return ok();
  });
}
