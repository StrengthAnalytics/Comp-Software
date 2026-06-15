-- Volunteer staff rota: an organiser builds a per-comp rota of staffing slots (the columns/roles of
-- the old Google Sheet), and volunteers sign themselves up by giving their name, email and mobile.
-- The rota is publicly viewable — a signed-up volunteer's NAME shows on the board so volunteers can
-- coordinate — but only the admin can edit it, and email + mobile are admin-only.
--
-- Design decisions (see the ADR in ARCHITECTURE.md §7):
--
--   * The app's SECOND anonymous write path. Like entry_submissions it is fenced to a single
--     INSERT-only policy (rota_signups) — but gated on the comp's own `rota_open` toggle rather
--     than on publication. The organiser opens volunteer sign-ups while the comp is still a draft
--     (recruiting crew ahead of going public), so the rota's anon read/write rides on `rota_open`,
--     NOT on is_comp_public().
--   * Contact PII (email, phone) is admin-only. The public board reads names through the PII-free
--     `public_rota_signups` view; the base table is never anon-readable. Mirrors public_lifters.
--   * A still-draft comp's identity (the board header) is exposed through the narrow
--     `public_rota_comps` view — slug/name/dates/withdrawal-contact only — so opening the rota
--     early does NOT widen anon access to the rest of the draft competition row.
--   * Slot capacity is enforced in the database (a BEFORE INSERT trigger, serialised per slot with
--     an advisory lock): the real authority that stops two volunteers taking the last spot and
--     bounds anon-insert abuse, since the anon API key is public by design.
--   * Removal/changes are admin-only (no self-service cancel): the board shows an admin-set
--     `rota_withdrawal_contact` line ("email/message … to withdraw or change your slot").
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

-- Rota settings on the competition -----------------------------------------------------------------

alter table public.competitions
  add column rota_open boolean not null default false,
  add column rota_withdrawal_contact text;

-- Rota structure (admin-built) ---------------------------------------------------------------------

-- A column of the rota grid, e.g. "Sat — AM", "Set-up". `day_label` is an optional banner the board
-- groups sections by (e.g. "Sat"); `subtitle` carries free text under the heading (e.g. weigh-in /
-- lift-off times). Independent of the comp's own sessions, which don't cover set-up / take-down.
create table public.rota_sections (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  day_label text,
  title text not null,
  subtitle text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index rota_sections_competition_idx on public.rota_sections (competition_id, sort_order);

-- A job within a section, e.g. "MC", "Spotters / Loaders". `capacity` is how many volunteers it
-- needs (the number of green slots); `arrive_by` is free text (e.g. "9:30am"). competition_id is
-- denormalised from the section so the RLS predicate and realtime filter need no join (as attempts
-- carry competition_id alongside entry_id); the admin write action sets it to the section's comp.
create table public.rota_roles (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  section_id uuid not null references public.rota_sections(id) on delete cascade,
  title text not null,
  arrive_by text,
  capacity integer not null default 1 check (capacity >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index rota_roles_competition_idx on public.rota_roles (competition_id);
create index rota_roles_section_idx on public.rota_roles (section_id, sort_order);

-- A volunteer claiming a slot. `name` is the only field the public sees (via public_rota_signups);
-- email + phone are admin-only contact details. competition_id is denormalised from the role for
-- the same RLS/realtime reason as above.
create table public.rota_signups (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  role_id uuid not null references public.rota_roles(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create index rota_signups_competition_idx on public.rota_signups (competition_id);
create index rota_signups_role_idx on public.rota_signups (role_id);
-- One person (by email, case-insensitively) holds a given slot at most once — stops a double-submit
-- taking two spots, while still letting the same person sign up for different roles (as the sheet does).
create unique index rota_signups_role_email_idx on public.rota_signups (role_id, lower(email));

-- Helper: is the comp accepting volunteer sign-ups? --------------------------------------------------

-- True when the comp's rota is open. NOT gated on publication — the organiser opens the rota while
-- the comp is still a draft. SECURITY DEFINER so the anon read/insert policies can consult
-- competitions without anon read on a draft comp. Mirrors comp_accepts_entries / is_comp_public.
create or replace function public.comp_rota_open(_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitions c
    where c.id = _competition_id
      and c.rota_open
  );
$$;

-- Capacity guard -----------------------------------------------------------------------------------

-- Refuses a sign-up once a slot is full. SECURITY DEFINER: the inserting role (anon) has no SELECT
-- on rota_signups, so the count must run with the owner's rights. The per-slot advisory lock
-- serialises concurrent inserts for the same role, so two volunteers can't both pass the check on
-- the last open spot (it releases at transaction end).
create or replace function public.enforce_rota_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_capacity integer;
  taken integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.role_id::text));

  select capacity into slot_capacity
  from public.rota_roles
  where id = new.role_id;

  if slot_capacity is null then
    -- The role was deleted between page load and submit. The submit action maps this to a friendly
    -- "this slot is no longer available" message.
    raise exception 'rota_role_missing';
  end if;

  select count(*) into taken
  from public.rota_signups
  where role_id = new.role_id;

  if taken >= slot_capacity then
    -- The submit action maps this (code P0001, this message) to a friendly "just filled" error.
    raise exception 'rota_slot_full';
  end if;

  return new;
end;
$$;

create trigger rota_signups_capacity
  before insert on public.rota_signups
  for each row execute function public.enforce_rota_slot_capacity();

-- RLS ----------------------------------------------------------------------------------------------

-- Structure: admins do everything; anon reads it while the rota is open (even on a draft comp).
alter table public.rota_sections enable row level security;

create policy "rota_sections_admin_all" on public.rota_sections
  for all to authenticated using (true) with check (true);

create policy "rota_sections_public_read" on public.rota_sections
  for select to anon
  using (public.comp_rota_open(competition_id));

alter table public.rota_roles enable row level security;

create policy "rota_roles_admin_all" on public.rota_roles
  for all to authenticated using (true) with check (true);

create policy "rota_roles_public_read" on public.rota_roles
  for select to anon
  using (public.comp_rota_open(competition_id));

-- Sign-ups: admins do everything (and are the only readers of contact details). The app's SECOND
-- anonymous write — anon may add itself to a slot on a rota-open comp, and may do nothing else (no
-- select/update/delete; the public reads names through public_rota_signups). The capacity trigger
-- above is the real ceiling on what an anon insert can pile in.
alter table public.rota_signups enable row level security;

create policy "rota_signups_admin_all" on public.rota_signups
  for all to authenticated using (true) with check (true);

create policy "rota_signups_public_insert" on public.rota_signups
  for insert to anon
  with check (public.comp_rota_open(competition_id));

-- Public-safe views (security_invoker OFF: run as owner, bypass the no-anon-select base grants; the
-- WHERE clause is the row gate, exactly like public_lifters) -----------------------------------------

-- Names + which slot, never email/phone. Rows limited to rota-open comps.
create view public.public_rota_signups
with (security_invoker = false) as
  select
    s.id,
    s.competition_id,
    s.role_id,
    s.name
  from public.rota_signups s
  where public.comp_rota_open(s.competition_id);

grant select on public.public_rota_signups to anon, authenticated;

-- Minimal identity of a rota-open comp, so the public board can render its header and withdrawal
-- line even while the comp itself is still a draft — without exposing the rest of the comp row.
create view public.public_rota_comps
with (security_invoker = false) as
  select
    c.id,
    c.slug,
    c.name,
    c.starts_on,
    c.ends_on,
    c.rota_open,
    c.rota_withdrawal_contact
  from public.competitions c
  where c.rota_open;

grant select on public.public_rota_comps to anon, authenticated;

-- Realtime -----------------------------------------------------------------------------------------

-- The admin rota view updates live as sign-ups land. Subscriptions inherit RLS: admin sessions
-- receive events, anon receives nothing (no select policy on the base table). The public board is
-- server-rendered (a sign-up sheet is not live competition state), with the capacity trigger as the
-- authority that prevents oversubscription.
alter table public.rota_signups replica identity full;
alter publication supabase_realtime add table public.rota_signups;
