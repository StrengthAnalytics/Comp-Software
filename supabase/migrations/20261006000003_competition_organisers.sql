-- Organiser email per competition. Each comp records the address its emails belong to: volunteer
-- rota change requests are sent there, and lifters' replies to their entry emails go there. It is
-- set on the competition's edit screen and filled in with the creating admin's email when a comp is
-- created, so once the app has more than one organiser account, each comp's emails reach the
-- person running it. (Unset = the app falls back to the ROTA_NOTIFY_EMAILS / ADMIN_EMAILS and
-- RESEND_REPLY_TO_EMAIL env vars.)
--
-- Its own admin-only table rather than a column on competitions, because competitions is
-- anon-readable for a public comp and this address should not be listed with the rest of the comp
-- row. The two anonymous actions that email on a comp's behalf (the entry form submit and the rota
-- change request) read it through the narrow public_comp_organisers view, which only returns the
-- address while that comp's entry form or rota is open — the only time those actions run. At those
-- times it is no more exposed than as the reply-to address on the emails lifters receive.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

create table public.competition_organisers (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  email text not null
    constraint competition_organisers_email_format
      check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now()
);

alter table public.competition_organisers enable row level security;

-- Admins read and write it, like every other setup row. No anon policy at all.
create policy "competition_organisers_admin_all" on public.competition_organisers
  for all to authenticated using (true) with check (true);

-- security_invoker OFF: runs as owner past the no-anon base table; the WHERE clause is the row gate,
-- exactly like public_rota_comps.
create view public.public_comp_organisers
with (security_invoker = false) as
  select
    o.competition_id,
    o.email
  from public.competition_organisers o
  where public.comp_accepts_entries(o.competition_id)
     or public.comp_rota_open(o.competition_id);

grant select on public.public_comp_organisers to anon, authenticated;
