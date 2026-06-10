import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { isIpfFederation } from '@/lib/constants';
import { fail, type ActionResult } from '@/types/action-result';

export const IPF_CATEGORIES_LOCKED_MESSAGE =
  'This competition uses the standard IPF age categories and weight classes, so they cannot be edited.';

// Gate for the age-category / weight-class write actions: an 'ipf' comp's category set is managed
// automatically (seeded at creation) and locked, so create/update/delete are rejected server-side —
// the hidden editors in the UI are not the enforcement. Returns an error ActionResult to return
// immediately, or null when the comp's categories are operator-editable. The idempotent seed
// actions are deliberately exempt: they only (re)write the canonical defaults and are the recovery
// path if the creation-time seed failed.
export async function requireEditableCategories(
  supabase: SupabaseClient<Database>,
  competitionId: string,
): Promise<ActionResult<never> | null> {
  const { data, error } = await supabase
    .from('competitions')
    .select('federation')
    .eq('id', competitionId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error);
    return fail('Could not check the competition. Please try again.');
  }
  if (!data) {
    return fail('Could not find that competition.');
  }
  if (isIpfFederation(data.federation)) {
    return fail(IPF_CATEGORIES_LOCKED_MESSAGE);
  }
  return null;
}
