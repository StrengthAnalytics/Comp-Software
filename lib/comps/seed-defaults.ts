import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DIVISIONS, DEFAULT_WEIGHT_CLASSES } from '@/lib/constants';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// The canonical IPF age divisions for a new comp, in running order. Single source for both the
// auto-seed on creation and the manual "Seed defaults" action, so they can't drift.
export function defaultDivisionRows(competitionId: string) {
  return DEFAULT_DIVISIONS.map((name, index) => ({
    competition_id: competitionId,
    name,
    sort_order: index,
  }));
}

// The canonical IPF weight classes for a new comp, in running order per gender.
export function defaultWeightClassRows(competitionId: string) {
  return DEFAULT_WEIGHT_CLASSES.map((weightClass, index) => ({
    competition_id: competitionId,
    name: weightClass.name,
    gender: weightClass.gender,
    lower_kg: weightClass.lower_kg,
    upper_kg: weightClass.upper_kg,
    sort_order: index,
  }));
}

// Seeds the canonical IPF age divisions and weight classes for a competition. Idempotent: each upsert
// ignores duplicates on the (competition_id, name) unique key, so this runs on creation and can be
// re-run from the edit screen without erroring or duplicating. Returns the first error, or null. Every
// comp is created with these (divisions and weight classes are canonical for now); bespoke sets can be
// edited afterwards on the comp edit screen.
export async function seedCompetitionDefaults(
  supabase: Client,
  competitionId: string,
): Promise<PostgrestError | null> {
  const { error: divisionError } = await supabase
    .from('divisions')
    .upsert(defaultDivisionRows(competitionId), { onConflict: 'competition_id,name', ignoreDuplicates: true });
  if (divisionError) {
    return divisionError;
  }

  const { error: weightClassError } = await supabase
    .from('weight_classes')
    .upsert(defaultWeightClassRows(competitionId), { onConflict: 'competition_id,name', ignoreDuplicates: true });
  if (weightClassError) {
    return weightClassError;
  }

  return null;
}
