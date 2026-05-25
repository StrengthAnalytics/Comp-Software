-- Row Level Security for every table under the simplified auth model.
--
--   * Admins (signed in via OTP, email in ADMIN_EMAILS) do everything. RLS grants all writes
--     to any authenticated user; requireAdmin() in server actions is the real gate. This is
--     safe ONLY because public sign-ups are disabled, so the sole session holders are admins.
--   * Anon reads rows belonging to a publicly visible competition (published/active/completed).
--   * Lifter PII (date_of_birth, ipf_member_id) is never exposed to anon: the public reads the
--     public_lifters view (migration 11), not the base table.
--
-- read  = SELECT
-- write = INSERT / UPDATE / DELETE

-- Helpers (SECURITY DEFINER so policies do not recurse into the tables they gate) ----------
create or replace function public.is_comp_public(_competition_id uuid)
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
      and c.status in ('published', 'active', 'completed')
  );
$$;

-- True when a lifter has an entry in a publicly visible competition.
-- Scopes the public_lifters view so the public sees only lifters who appear in a public meet.
create or replace function public.lifter_in_public_comp(_lifter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entries e
    join public.competitions c on c.id = e.competition_id
    where e.lifter_id = _lifter_id
      and c.status in ('published', 'active', 'completed')
  );
$$;

-- profiles: admin-managed; rows are created by the auth.users trigger (SECURITY DEFINER) ----
alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- competitions --------------------------------------------------------------------------------
alter table public.competitions enable row level security;

create policy "competitions_admin_all" on public.competitions
  for all to authenticated using (true) with check (true);

create policy "competitions_public_read" on public.competitions
  for select to anon
  using (public.is_comp_public(id));

-- divisions -----------------------------------------------------------------------------------
alter table public.divisions enable row level security;

create policy "divisions_admin_all" on public.divisions
  for all to authenticated using (true) with check (true);

create policy "divisions_public_read" on public.divisions
  for select to anon
  using (public.is_comp_public(competition_id));

-- weight_classes ------------------------------------------------------------------------------
alter table public.weight_classes enable row level security;

create policy "weight_classes_admin_all" on public.weight_classes
  for all to authenticated using (true) with check (true);

create policy "weight_classes_public_read" on public.weight_classes
  for select to anon
  using (public.is_comp_public(competition_id));

-- platforms -----------------------------------------------------------------------------------
alter table public.platforms enable row level security;

create policy "platforms_admin_all" on public.platforms
  for all to authenticated using (true) with check (true);

create policy "platforms_public_read" on public.platforms
  for select to anon
  using (public.is_comp_public(competition_id));

-- sessions ------------------------------------------------------------------------------------
alter table public.sessions enable row level security;

create policy "sessions_admin_all" on public.sessions
  for all to authenticated using (true) with check (true);

create policy "sessions_public_read" on public.sessions
  for select to anon
  using (public.is_comp_public(competition_id));

-- flights -------------------------------------------------------------------------------------
alter table public.flights enable row level security;

create policy "flights_admin_all" on public.flights
  for all to authenticated using (true) with check (true);

create policy "flights_public_read" on public.flights
  for select to anon
  using (public.is_comp_public(competition_id));

-- lifters: admins only on the base table (full PII). Anon reads public_lifters (migration 11).
alter table public.lifters enable row level security;

create policy "lifters_admin_all" on public.lifters
  for all to authenticated using (true) with check (true);

revoke select on public.lifters from anon;

-- entries -------------------------------------------------------------------------------------
alter table public.entries enable row level security;

create policy "entries_admin_all" on public.entries
  for all to authenticated using (true) with check (true);

create policy "entries_public_read" on public.entries
  for select to anon
  using (public.is_comp_public(competition_id));

-- attempts ------------------------------------------------------------------------------------
alter table public.attempts enable row level security;

create policy "attempts_admin_all" on public.attempts
  for all to authenticated using (true) with check (true);

create policy "attempts_public_read" on public.attempts
  for select to anon
  using (public.is_comp_public(competition_id));

-- referee_decisions ---------------------------------------------------------------------------
alter table public.referee_decisions enable row level security;

create policy "referee_decisions_admin_all" on public.referee_decisions
  for all to authenticated using (true) with check (true);

create policy "referee_decisions_public_read" on public.referee_decisions
  for select to anon
  using (public.is_comp_public(competition_id));
