-- Add the British Powerlifting "division" to entries: the region / home nation a lifter competes on
-- behalf of (England, Wales, Scotland, British, the regional bodies, …). This is the second of two
-- changes; the first renamed the old age-category `divisions` table to `age_categories`, freeing the
-- word for this federation meaning.
--
-- A division is an informational affiliation, NOT a placement dimension — placement stays weight class
-- × age category × sex, unchanged. The column is free text, constrained by the app to the fixed
-- BP_DIVISIONS list (a dropdown on the entry card, a validated bulk-import column), mirroring how the
-- records feature stores its free-text region. Nullable and optional: it is set after registration
-- like the weight class, and many entries may never carry one.
--
-- Realtime: `entries` is already in the supabase_realtime publication, so the new column is broadcast
-- on change with no publication change. RLS is unchanged — the existing entries policies cover every
-- column of the row.

alter table public.entries add column division text;
