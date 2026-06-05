import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Fetches a competition by slug, memoized per request with React cache() so the comp-slug layout
// and the page it wraps share one query instead of each fetching the row. Selects the superset of
// columns the layout (name, is_team_competition) and the operational pages (event_type, status,
// kit_type for the run screen's IPF GL column, starts_on for the entries screen's age-category
// gating) need, so every caller reads from the same memoized result.
export const getCompBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('competitions')
    .select('id, name, slug, event_type, status, is_team_competition, kit_type, starts_on')
    .eq('slug', slug)
    .maybeSingle();
  return data;
});
