-- Federation becomes the comp's rule-set choice, picked once at creation:
--
--   'ipf'    → the standard IPF age categories and weight classes are seeded automatically at
--              creation and locked: the Setup screen shows them read-only and the category write
--              actions reject edits. (The idempotent seed actions stay allowed as the recovery
--              path if the creation-time seed failed.)
--   'custom' → the operator builds their own categories — exactly the behaviour every comp had
--              before this change.
--
-- The column has existed since the first migration (text, default 'IPF') but nothing wrote or
-- read it. Every existing comp is backfilled to 'custom' so nothing already in the database
-- changes behaviour: their category editors stay editable and their checklists keep the category
-- steps. New comps state a federation explicitly (the create form requires it). A CHECK constraint
-- pins the two codes at the database; the app validates the same pair with Zod at the boundary.
--
-- Apply via the Supabase SQL editor. No change to types/database.types.ts is needed (the column
-- stays text → string); no RLS change (competitions policies are table-level).

update public.competitions set federation = 'custom';

alter table public.competitions alter column federation set default 'custom';

alter table public.competitions
  add constraint competitions_federation_check check (federation in ('ipf', 'custom'));
