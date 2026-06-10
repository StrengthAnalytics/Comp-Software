import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { matchAgeCategoryByName, resolveAgeCategory } from '@/lib/age-categories/age-category';
import { escapeLikePattern } from '@/lib/supabase/like-pattern';
import type { Database } from '@/types/database.types';

// The registration decision rules shared by every path that turns a person into a comp entry —
// single registration (createEntryAction), the bulk importer, and public-form approval
// (approveSubmissionAction). The three flows orchestrate differently (a search-picked lifter vs
// sheet rows vs a submission), but how a date of birth becomes an age category, how a class name
// resolves to a weight-class row, and how a name finds an existing lifter must be ONE rule each,
// or the paths drift and the same lifter registers differently depending on the door they came in.

// The comp's age-category row id for a lifter, derived from the comp start date and date of birth
// (IPF rule: competition year − birth year), or null when either date is unusable or the comp has
// no row for the computed band — the caller leaves it for the operator, never blocks on it.
export function deriveAgeCategoryId(
  ageCategories: readonly { id: string; name: string }[],
  competitionStartsOn: string | null,
  dateOfBirth: string | null,
): string | null {
  const categoryName = resolveAgeCategory(competitionStartsOn, dateOfBirth);
  return matchAgeCategoryByName(ageCategories, categoryName)?.id ?? null;
}

// Resolving a typed/submitted class name against the comp's weight classes. The three outcomes are
// distinct because the bulk importer warns differently for each: a class that exists but belongs to
// the other sex is a different mistake from a name the comp doesn't have.
export type WeightClassMatch<T> =
  | { status: 'matched'; weightClass: T }
  | { status: 'wrong_gender' }
  | { status: 'not_found' };

// Case- and whitespace-insensitive on the name; a comp where both sexes share a class name (possible
// with custom classes) prefers the row for the lifter's own sex.
export function matchWeightClassByName<T extends { name: string; gender: string }>(
  weightClasses: readonly T[],
  weightClassName: string,
  gender: string,
): WeightClassMatch<T> {
  const target = weightClassName.trim().toLowerCase();
  const sameName = weightClasses.filter(
    (weightClass) => weightClass.name.trim().toLowerCase() === target,
  );
  if (sameName.length === 0) {
    return { status: 'not_found' };
  }
  const matched = sameName.find((weightClass) => weightClass.gender === gender);
  return matched ? { status: 'matched', weightClass: matched } : { status: 'wrong_gender' };
}

// Finds an existing lifter by exact (case-insensitive) name. The name is escaped so it always
// matches literally — it may be public input (a form submission), where a crafted "%" must never
// wildcard onto someone else's row.
export async function findLifterIdByName(
  supabase: SupabaseClient<Database>,
  firstName: string,
  surname: string,
): Promise<{ lifterId: string | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('lifters')
    .select('id')
    .ilike('surname', escapeLikePattern(surname))
    .ilike('first_name', escapeLikePattern(firstName))
    .limit(1)
    .maybeSingle();
  return { lifterId: data?.id ?? null, error };
}
