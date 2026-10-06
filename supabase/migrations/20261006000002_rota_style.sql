-- Rota formatting. The organiser can now choose how the volunteer rota grid looks — the weight of
-- the lines between jobs, sessions and days, the line colour, and the colours of filled and open
-- slots, the day banners and the headers — on the staff rota's Formatting tab. The choices are kept
-- on the comp row as one small jsonb object (validated by Zod, `rotaStyleSchema` in
-- types/rota-style.ts; the app reads it leniently, so a missing or unknown option falls back to its
-- default). Null means the default look.
--
-- The public sign-up board reads the comp through the narrow public_rota_comps view (it must work
-- while the comp is still a draft), so the view gains the column too. `create or replace view` can
-- only append columns, which is what this does; the view's grants are kept.
--
-- No RLS change: competitions is already admin-write, and the view stays gated on rota_open.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

alter table public.competitions
  add column rota_style jsonb
  constraint competitions_rota_style_is_object check (rota_style is null or jsonb_typeof(rota_style) = 'object');

create or replace view public.public_rota_comps
with (security_invoker = false) as
  select
    c.id,
    c.slug,
    c.name,
    c.starts_on,
    c.ends_on,
    c.rota_open,
    c.rota_withdrawal_contact,
    c.rota_style
  from public.competitions c
  where c.rota_open;
