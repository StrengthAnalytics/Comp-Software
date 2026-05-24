-- Row Level Security for every table, mirroring the permission matrix in
-- ARCHITECTURE.md section 3 and lib/permissions/matrix.ts. comp_roles is the
-- authorization source, consulted via the SECURITY DEFINER helpers.
--
-- read  = SELECT
-- write = INSERT / UPDATE / DELETE
--
-- Staff readers (read access to comp data) = meet_director, scorekeeper, table_loader, announcer.
-- Public/viewer read is granted when the competition is publicly visible (is_comp_public).

-- profiles ------------------------------------------------------------------
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

-- competitions --------------------------------------------------------------
alter table public.competitions enable row level security;

create policy "competitions_select" on public.competitions
  for select to anon, authenticated
  using (
    public.is_comp_public(id)
    or public.has_comp_role(id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

-- Bootstrap: any authenticated user may create a comp; the trigger makes them meet_director.
create policy "competitions_insert" on public.competitions
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "competitions_update" on public.competitions
  for update to authenticated
  using (public.has_comp_role(id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(id, array['meet_director']::public.comp_role[]));

create policy "competitions_delete" on public.competitions
  for delete to authenticated
  using (public.has_comp_role(id, array['meet_director']::public.comp_role[]));

-- divisions -----------------------------------------------------------------
alter table public.divisions enable row level security;

create policy "divisions_select" on public.divisions
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "divisions_write" on public.divisions
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]));

-- weight_classes ------------------------------------------------------------
alter table public.weight_classes enable row level security;

create policy "weight_classes_select" on public.weight_classes
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "weight_classes_write" on public.weight_classes
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]));

-- platforms -----------------------------------------------------------------
alter table public.platforms enable row level security;

create policy "platforms_select" on public.platforms
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "platforms_write" on public.platforms
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]));

-- sessions ------------------------------------------------------------------
alter table public.sessions enable row level security;

create policy "sessions_select" on public.sessions
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "sessions_write" on public.sessions
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]));

-- flights -------------------------------------------------------------------
alter table public.flights enable row level security;

create policy "flights_select" on public.flights
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "flights_write" on public.flights
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper']::public.comp_role[]));

-- lifters (not comp-scoped) -------------------------------------------------
alter table public.lifters enable row level security;

create policy "lifters_select" on public.lifters
  for select to anon, authenticated
  using (
    public.has_any_comp_role(array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
    or public.lifter_in_public_comp(id)
  );

create policy "lifters_write" on public.lifters
  for all to authenticated
  using (public.has_any_comp_role(array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]))
  with check (public.has_any_comp_role(array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]));

-- entries -------------------------------------------------------------------
alter table public.entries enable row level security;

create policy "entries_select" on public.entries
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "entries_write" on public.entries
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]));

-- attempts ------------------------------------------------------------------
-- Note: table_loader is restricted to "declared weight only" in the matrix. That is a
-- column-level rule enforced at the server-action boundary, not in row RLS.
alter table public.attempts enable row level security;

create policy "attempts_select" on public.attempts
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "attempts_write" on public.attempts
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader']::public.comp_role[]));

-- referee_decisions ---------------------------------------------------------
alter table public.referee_decisions enable row level security;

create policy "referee_decisions_select" on public.referee_decisions
  for select to anon, authenticated
  using (
    public.is_comp_public(competition_id)
    or public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[])
  );

create policy "referee_decisions_write" on public.referee_decisions
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper']::public.comp_role[]));

-- comp_roles (no public read; viewer has no access) -------------------------
alter table public.comp_roles enable row level security;

create policy "comp_roles_select" on public.comp_roles
  for select to authenticated
  using (public.has_comp_role(competition_id, array['meet_director', 'scorekeeper', 'table_loader', 'announcer']::public.comp_role[]));

create policy "comp_roles_write" on public.comp_roles
  for all to authenticated
  using (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]))
  with check (public.has_comp_role(competition_id, array['meet_director']::public.comp_role[]));
