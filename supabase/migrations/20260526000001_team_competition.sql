-- Team competition format: a named team of three lifters, one per discipline. Each member contests
-- only their assigned lift; the team score is the sum of the three members' IPF GL points, each
-- taken from that member's best lift. See the ADR in ARCHITECTURE.md section 7.

-- Comp-level flag. Team format applies only to full-power comps (all three lifts are contested,
-- spread across the team's members); the registration layer enforces that, not the schema.
alter table public.competitions
  add column is_team_competition boolean not null default false;

-- A team belongs to one competition. Its members are entries tagged with team_id + team_lift below.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create index teams_competition_idx on public.teams (competition_id);

-- An entry joins a team in exactly one lift role. Removing a team unassigns its members rather than
-- deleting their registrations (ON DELETE SET NULL). The check keeps team_id and team_lift in step,
-- so a member can never be half-assigned (a team_id with no role, or a role with no team).
alter table public.entries
  add column team_id uuid references public.teams (id) on delete set null,
  add column team_lift public.lift_type,
  add constraint entries_team_role_together check ((team_id is null) = (team_lift is null));

-- One member per lift per team: a team cannot have two squatters, two benchers or two deadlifters.
create unique index entries_team_lift_unique on public.entries (team_id, team_lift)
  where team_id is not null;

create index entries_team_idx on public.entries (team_id);

-- RLS mirrors the other per-comp tables: admins (any authenticated session) do everything; anon
-- reads teams belonging to a publicly visible competition.
alter table public.teams enable row level security;

create policy "teams_admin_all" on public.teams
  for all to authenticated using (true) with check (true);

create policy "teams_public_read" on public.teams
  for select to anon
  using (public.is_comp_public(competition_id));
