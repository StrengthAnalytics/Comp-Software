-- Rename the "divisions" concept to "age_categories".
--
-- Historically a "division" meant a lifter's age category (U16–M6), and it remains a placement
-- dimension: individual placement is weight class × age category × sex (lib/scorekeeper/placings.ts).
-- This migration frees the word "division" for its British Powerlifting meaning — the region / home
-- nation a lifter competes on behalf of — which lands as a separate entry attribute in a later
-- migration. This is a PURE RENAME with no behaviour change: the table, the entries foreign-key
-- column, the indexes, the constraints and the RLS policies all move across under the new name.
--
-- Realtime: `divisions` is not in the supabase_realtime publication, and `entries` (which carries the
-- foreign-key column) already is, so renaming the column needs no publication change — Realtime
-- broadcasts whatever columns the published table currently has.

-- Table + foreign-key column ------------------------------------------------------------------
alter table public.divisions rename to age_categories;
alter table public.entries rename column division_id to age_category_id;

-- Keep index, constraint and policy names in step with the new table name -----------------------
alter index public.divisions_competition_idx rename to age_categories_competition_idx;

alter table public.age_categories rename constraint divisions_pkey to age_categories_pkey;
alter table public.age_categories
  rename constraint divisions_competition_id_name_key to age_categories_competition_id_name_key;
alter table public.age_categories
  rename constraint divisions_competition_id_fkey to age_categories_competition_id_fkey;

alter table public.entries
  rename constraint entries_division_id_fkey to entries_age_category_id_fkey;

alter policy "divisions_admin_all" on public.age_categories rename to "age_categories_admin_all";
alter policy "divisions_public_read" on public.age_categories rename to "age_categories_public_read";
